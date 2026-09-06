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

    /**
     * Splits extracted text into sections of paragraphs.
     * @param {string} text 
     * @param {number} paragraphsPerSection 
     * @returns {Promise<Array<{id: number, text: string, status: string}>>}
     */
    async function splitIntoSections(text, paragraphsPerSection = 4) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        // Split by double newlines first, fallback to single newlines if no double newlines exist
        let paragraphs = [];
        if (text.includes('\n\n')) {
            paragraphs = text.split(/\n\n+/);
        } else {
            paragraphs = text.split(/\n+/);
        }

        paragraphs = paragraphs.map(p => p.trim()).filter(p => p.length > 0);

        const sections = [];
        let currentSectionText = [];

        for (let i = 0; i < paragraphs.length; i++) {
            currentSectionText.push(paragraphs[i]);

            if (currentSectionText.length === paragraphsPerSection || i === paragraphs.length - 1) {
                sections.push({
                    id: sections.length,
                    text: currentSectionText.join('\n\n'),
                    status: sections.length === 0 ? 'unlocked' : 'locked'
                });
                currentSectionText = [];
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
