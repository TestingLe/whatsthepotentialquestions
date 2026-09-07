window.FileParser = (function() {
    /**
     * Extracts the file extension and converts it to lowercase.
     * @param {string} filename 
     * @returns {string}
     */
    function getFileExtension(filename) {
        if (!filename || !filename.includes('.')) return '';
        return filename.split('.').pop().toLowerCase();
    }

    /**
     * Reads a file as an ArrayBuffer.
     * @param {File} file 
     * @returns {Promise<ArrayBuffer>}
     */
    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file as ArrayBuffer.'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Reads a file as Text.
     * @param {File} file 
     * @returns {Promise<string>}
     */
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file as text.'));
            reader.readAsText(file);
        });
    }

    /**
     * Parses a PDF file and extracts text.
     * @param {ArrayBuffer} arrayBuffer 
     * @returns {Promise<string>}
     */
    async function parsePDF(arrayBuffer) {
        try {
            if (typeof pdfjsLib === 'undefined') {
                throw new Error('PDF.js library (pdfjsLib) is not loaded.');
            }
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            let fullText = '';

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n\n';
            }
            return fullText.trim();
        } catch (error) {
            throw new Error(`Error parsing PDF: ${error.message}`);
        }
    }

    /**
     * Parses a DOCX file and extracts text.
     * @param {ArrayBuffer} arrayBuffer 
     * @returns {Promise<string>}
     */
    async function parseDOCX(arrayBuffer) {
        try {
            if (typeof mammoth === 'undefined') {
                throw new Error('Mammoth library is not loaded.');
            }
            const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            return result.value;
        } catch (error) {
            throw new Error(`Error parsing DOCX: ${error.message}`);
        }
    }

    /**
     * Parses a file (PDF, DOCX, TXT) and returns the extracted text.
     * @param {File} file 
     * @returns {Promise<string>}
     */
    async function parseFile(file) {
        if (!file) {
            throw new Error('No file provided.');
        }

        const extension = getFileExtension(file.name);

        try {
            switch (extension) {
                case 'txt':
                    return await readFileAsText(file);
                case 'pdf': {
                    const pdfBuffer = await readFileAsArrayBuffer(file);
                    return await parsePDF(pdfBuffer);
                }
                case 'docx': {
                    const docxBuffer = await readFileAsArrayBuffer(file);
                    return await parseDOCX(docxBuffer);
                }
                default:
                    throw new Error(`Unsupported file type: .${extension}. Please upload a PDF, DOCX, or TXT file.`);
            }
        } catch (error) {
            throw new Error(`File parsing failed: ${error.message}`);
        }
    }

    // Number word mapping
    const wordToNum = {
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
        'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
        'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20
    };

    /**
     * Parses a Roman numeral into an integer.
     */
    function parseRoman(str) {
        if (!str) return null;
        const romanMap = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
        const s = str.toLowerCase();
        let num = 0;
        for (let i = 0; i < s.length; i++) {
            const cur = romanMap[s[i]];
            const next = romanMap[s[i + 1]];
            if (!cur) return null;
            if (next && cur < next) {
                num += (next - cur);
                i++;
            } else {
                num += cur;
            }
        }
        return num > 0 ? num : null;
    }

    /**
     * Parses numeric tokens (digits, number words, or roman numerals).
     */
    function parseNumToken(token) {
        if (!token) return null;
        const cleaned = token.trim().toLowerCase();
        if (/^\d+$/.test(cleaned)) return parseInt(cleaned, 10);
        if (wordToNum[cleaned]) return wordToNum[cleaned];
        const roman = parseRoman(cleaned);
        if (roman) return roman;
        return null;
    }

    /**
     * Splits extracted text into exact structured sections based on the requested hierarchy:
     * 1. Priority 1: Check for "Lesson" markers (Lesson 1, Lesson 2, etc.) so each section has ONLY that lesson.
     * 2. Priority 2: If no "Lesson", check for "Chapter" markers (Chapter 1, Chapter 2, etc.).
     * 3. Priority 3: If neither exists, carefully read the file for modules/units/numbered headings or semantic topic sections.
     * 
     * @param {string} text The extracted document text.
     * @returns {Promise<Array<{id: number, title: string, shortTitle: string, subtitle: string, type: string, number: number, text: string, status: string}>>}
     */
    async function splitIntoSections(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        if (!normalized) return [];

        let matches = [];
        let match;

        // ════════════════════════════════════════════════════════════════
        // STEP 1: Search for "Lesson" keyword markers
        // E.g., "Lesson 1", "Lesson 01", "LESSON I", "Lesson One: ...", "# Lesson 1"
        // ════════════════════════════════════════════════════════════════
        const lessonRegex = /(?:^|\n)[ \t]*(?:#+\s*)?(?:Lesson|LESSON)\s*(?:#|no\.?\s*)?([0-9]+|[IVXLCDMivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b([^\n]*)/gi;

        while ((match = lessonRegex.exec(normalized)) !== null) {
            matches.push({
                index: match.index + (match[0].startsWith('\n') ? 1 : 0),
                fullMatch: match[0].trim(),
                numToken: match[1],
                num: parseNumToken(match[1]),
                restOfLine: (match[2] || '').trim(),
                type: 'lesson'
            });
        }

        // ════════════════════════════════════════════════════════════════
        // STEP 2: If no "Lesson" found, search for "Chapter" keyword markers
        // E.g., "Chapter 1", "CHAPTER II", "Chapter One: ...", "# Chapter 1"
        // ════════════════════════════════════════════════════════════════
        if (matches.length === 0) {
            const chapterRegex = /(?:^|\n)[ \t]*(?:#+\s*)?(?:Chapter|CHAPTER)\s*(?:#|no\.?\s*)?([0-9]+|[IVXLCDMivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b([^\n]*)/gi;
            while ((match = chapterRegex.exec(normalized)) !== null) {
                matches.push({
                    index: match.index + (match[0].startsWith('\n') ? 1 : 0),
                    fullMatch: match[0].trim(),
                    numToken: match[1],
                    num: parseNumToken(match[1]),
                    restOfLine: (match[2] || '').trim(),
                    type: 'chapter'
                });
            }
        }

        // ════════════════════════════════════════════════════════════════
        // STEP 3: If no "Lesson" and no "Chapter", read carefully the file
        // ════════════════════════════════════════════════════════════════
        if (matches.length === 0) {
            // 3a. Check for Module, Unit, Part, Topic, Week
            const unitRegex = /(?:^|\n)[ \t]*(?:#+\s*)?(?:Module|MODULE|Unit|UNIT|Part|PART|Topic|TOPIC|Week|WEEK)\s*(?:#|no\.?\s*)?([0-9]+|[IVXLCDMivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b([^\n]*)/gi;
            while ((match = unitRegex.exec(normalized)) !== null) {
                const rawType = match[0].trim().replace(/^#+\s*/, '').split(/\s+/)[0].toLowerCase();
                matches.push({
                    index: match.index + (match[0].startsWith('\n') ? 1 : 0),
                    fullMatch: match[0].trim(),
                    numToken: match[1],
                    num: parseNumToken(match[1]),
                    restOfLine: (match[2] || '').trim(),
                    type: rawType
                });
            }
        }

        if (matches.length === 0) {
            // 3b. Check for numbered section headers like "1. Introduction", "2. Methodology"
            const numberedRegex = /(?:^|\n)[ \t]*(?:#+\s*)?([0-9]+|[IVXLCDMivxlcdm]+)[\.:]\s+([A-Z][^\n]{3,80})/g;
            while ((match = numberedRegex.exec(normalized)) !== null) {
                const num = parseNumToken(match[1]);
                if (num !== null) {
                    matches.push({
                        index: match.index + (match[0].startsWith('\n') ? 1 : 0),
                        fullMatch: match[0].trim(),
                        numToken: match[1],
                        num: num,
                        restOfLine: match[2].trim(),
                        type: 'section'
                    });
                }
            }
        }

        if (matches.length === 0) {
            // 3c. Check for Markdown headers like "# Header" or "## Header"
            const mdRegex = /(?:^|\n)(?:#{1,3})\s+([^\n]{3,80})/g;
            let mdCount = 0;
            while ((match = mdRegex.exec(normalized)) !== null) {
                mdCount++;
                matches.push({
                    index: match.index + (match[0].startsWith('\n') ? 1 : 0),
                    fullMatch: match[0].trim(),
                    numToken: String(mdCount),
                    num: mdCount,
                    restOfLine: match[1].trim(),
                    type: 'topic'
                });
            }
        }

        // If explicit section boundaries were identified
        if (matches.length >= 1) {
            const sections = [];
            for (let i = 0; i < matches.length; i++) {
                const cur = matches[i];
                const next = matches[i + 1];
                const start = cur.index;
                const end = next ? next.index : normalized.length;
                let sectionText = normalized.slice(start, end).trim();

                // If there was text before match 0 (e.g. title or short preface), attach it to section 1
                if (i === 0 && cur.index > 0) {
                    const prefix = normalized.slice(0, cur.index).trim();
                    if (prefix.length > 0 && prefix.length < 800) {
                        sectionText = prefix + '\n\n' + sectionText;
                    }
                }

                // Clean title and subtitle
                let cleanSubtitle = cur.restOfLine.replace(/^[:\-–—\.]\s*/, '').trim();
                const typeCapitalized = cur.type.charAt(0).toUpperCase() + cur.type.slice(1);
                const numDisplay = cur.num !== null ? cur.num : (i + 1);
                const shortTitle = `${typeCapitalized} ${numDisplay}`;
                const fullTitle = cleanSubtitle ? `${shortTitle}: ${cleanSubtitle}` : shortTitle;

                sections.push({
                    id: i,
                    type: cur.type,
                    number: numDisplay,
                    shortTitle: shortTitle,
                    subtitle: cleanSubtitle || '',
                    title: fullTitle,
                    text: sectionText,
                    status: i === 0 ? 'unlocked' : 'locked'
                });
            }
            return sections;
        }

        // ════════════════════════════════════════════════════════════════
        // 3d. Fallback: No headings found — read paragraphs carefully
        // Group into balanced, rich sections suitable for 15 comprehension questions
        // ════════════════════════════════════════════════════════════════
        let paragraphs = normalized.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);
        if (paragraphs.length <= 1) {
            paragraphs = normalized.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
        }

        // Target 3-5 paragraphs per section (at least ~350 words) so 15 questions can be generated
        const targetParas = Math.max(2, Math.min(5, Math.ceil(paragraphs.length / 4)));
        const sections = [];
        let currentParas = [];

        for (let i = 0; i < paragraphs.length; i++) {
            currentParas.push(paragraphs[i]);
            if (currentParas.length >= targetParas || i === paragraphs.length - 1) {
                const secIndex = sections.length;
                const secText = currentParas.join('\n\n');
                const firstLine = currentParas[0].replace(/^[#\s\d\.\-]+/, '').slice(0, 50).trim();
                const subtitle = firstLine.length > 5 ? firstLine : `Study Part ${secIndex + 1}`;

                sections.push({
                    id: secIndex,
                    type: 'section',
                    number: secIndex + 1,
                    shortTitle: `Section ${secIndex + 1}`,
                    subtitle: subtitle,
                    title: `Section ${secIndex + 1}: ${subtitle}`,
                    text: secText,
                    status: secIndex === 0 ? 'unlocked' : 'locked'
                });
                currentParas = [];
            }
        }

        return sections;
    }

    return {
        parseFile,
        splitIntoSections,
        getFileExtension
    };
})();
