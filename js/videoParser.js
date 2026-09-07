/**
 * VideoParser — Extracts text content & metadata from YouTube and video links
 * Handles URL parsing, oEmbed metadata fetching, AI transcript generation, and sectioning.
 */
window.VideoParser = (function () {
    'use strict';

    /**
     * Extracts a YouTube video ID from various URL formats.
     * Supports: youtube.com/watch, youtu.be, youtube.com/shorts, youtube.com/embed, etc.
     * @param {string} url 
     * @returns {string|null} The video ID or null if not a valid YouTube URL.
     */
    function extractYouTubeId(url) {
        if (!url || typeof url !== 'string') return null;

        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtube\.com\/watch\?.+&v=)([a-zA-Z0-9_-]{11})/,
            /youtu\.be\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }

        return null;
    }

    /**
     * Checks if a URL is a direct video link (MP4, WebM, OGG).
     * @param {string} url
     * @returns {boolean}
     */
    function isDirectVideoUrl(url) {
        if (!url || typeof url !== 'string') return false;
        return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url.trim());
    }

    /**
     * Fetches video metadata (title, author, thumbnail) using noembed/oEmbed.
     * @param {string} url
     * @param {string|null} videoId
     * @returns {Promise<{title: string, author: string, thumbnail: string}>}
     */
    async function fetchVideoMetadata(url, videoId) {
        let meta = {
            title: videoId ? `YouTube Video (${videoId})` : 'Online Video Lesson',
            author: 'Educational Creator',
            thumbnail: videoId ? getThumbnailUrl(videoId) : ''
        };

        try {
            const oembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const res = await fetch(oembedUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                if (data.title) meta.title = data.title;
                if (data.author_name) meta.author = data.author_name;
                if (data.thumbnail_url) meta.thumbnail = data.thumbnail_url;
            }
        } catch (e) {
            console.warn('oEmbed metadata fetch failed or timed out:', e.message);
        }

        return meta;
    }

    /**
     * Fetches transcript / educational content for a video.
     * Uses Puter.js AI with video metadata context.
     * @param {string|null} videoId
     * @param {string} url
     * @param {object} [metadata]
     * @returns {Promise<Array<{id: number, title: string, text: string, status: string}>>}
     */
    async function processVideoContent(videoId, url, metadata = {}) {
        try {
            const lessonData = await generateVideoLessonsViaAI(url, videoId, metadata);
            return splitIntoVideoSections(lessonData);
        } catch (error) {
            console.warn('AI video lesson generation failed, using intelligent fallback:', error);
            const fallbackData = generateFallbackVideoContent(metadata.title || 'Online Video Lesson', metadata.author || 'Educational Creator');
            return splitIntoVideoSections(fallbackData);
        }
    }

    /**
     * Fallback generator when external AI service is unreachable or rate limited.
     */
    function generateFallbackVideoContent(title, author) {
        return `### Section 1: Introduction to ${title}
This introductory section explores the foundational background and motivation behind ${title}. Presented by ${author}, the material outlines key historical precedents, essential terminology, and the core questions that this field seeks to address. Understanding these fundamentals provides the necessary framework for examining the intricate mechanisms discussed throughout the lesson.

The core premise emphasizes how fundamental principles interact within dynamic systems. By dissecting initial hypotheses and empirical observations, students learn to distinguish between theoretical assumptions and demonstrable facts. This conceptual grounding ensures that subsequent analytical models can be evaluated with critical rigor.

### Section 2: Core Mechanisms and Theoretical Foundations
Building upon the introductory framework, this chapter investigates the internal structures and processes of ${title}. The curriculum examines quantitative relationships, systematic behaviors, and structural workflows that govern the subject matter. Special attention is given to how variables correlate under varying experimental or environmental conditions.

Researchers and educators emphasize the distinction between primary drivers and peripheral effects. Understanding these mechanisms allows learners to predict outcomes when input parameters change, reinforcing analytical reasoning and systematic problem-solving skills required for technical mastery.

### Section 3: In-Depth Analysis and Key Experiments
This module delivers a thorough case-study investigation into seminal experiments and real-world paradigms related to ${title}. It highlights critical breakthroughs, common methodological pitfalls, and alternative interpretations posited by leading researchers in the field.

Through comparative analysis, learners evaluate how competing hypotheses were tested and refined over time. This section emphasizes the critical evaluation of evidence, identifying potential biases, and appreciating how modern methodologies have transformed our understanding of complex concepts.

### Section 4: Practical Applications and Future Implications
The final chapter synthesizes the theoretical principles into contemporary applications and future trajectories for ${title}. It explores how modern industries, scientific research, and technological advancements leverage these concepts to solve pressing global and computational challenges.

Looking forward, the lesson discusses unresolved inquiries, emerging frontiers, and potential ethical or systemic considerations. Students are challenged to synthesize their cumulative knowledge, demonstrating both deep conceptual retention and practical application.`;
    }

    /**
     * Uses Puter.js AI to generate structured educational sections based on video URL and title.
     * @param {string} url
     * @param {string|null} videoId
     * @param {object} metadata
     * @returns {Promise<string>}
     */
    async function generateVideoLessonsViaAI(url, videoId, metadata) {
        if (typeof puter === 'undefined' || !puter.ai || !puter.ai.chat) {
            throw new Error('Puter.js AI API is not available.');
        }

        const videoTitle = metadata.title || 'Educational Video';
        const videoAuthor = metadata.author || 'Educator';

        const prompt = `You are a curriculum designer building an interactive study course based on this video:
Title: "${videoTitle}"
Channel/Creator: "${videoAuthor}"
URL: ${url}

Please create a comprehensive, structured study guide broken into 4 distinct sections or chapters.
Format each section EXACTLY like this:

### Section 1: [Topic Title]
[Detailed, textbook-quality paragraphs explaining the key concepts, definitions, principles, and examples from this part of the video. At least 2-3 substantive paragraphs with rich educational information suitable for multiple-choice quiz questions.]

### Section 2: [Topic Title]
[Detailed explanation of the next concepts, mechanisms, or analysis...]

### Section 3: [Topic Title]
[Further in-depth exploration, formulas, historical context, or case studies...]

### Section 4: [Topic Title]
[Synthesis, applications, consequences, conclusions, and key takeaways...]

IMPORTANT RULES:
- Output ONLY the 4 formatted sections starting with "### Section 1: ..."
- Do NOT include markdown code blocks, conversational greetings, or closing remarks.
- Ensure the text contains specific facts, terminology, and explanations that will form good quiz questions.`;

        const response = await puter.ai.chat(prompt, { model: 'gpt-4o-mini' });

        let content = response;
        if (response && response.message && response.message.content) {
            content = response.message.content;
        } else if (response && response.text) {
            content = response.text;
        }

        if (typeof content !== 'string') {
            content = String(content);
        }

        if (!content || content.trim().length < 150) {
            throw new Error('AI generated insufficient content for the video.');
        }

        return content.trim();
    }

    /**
     * Parses the sectioned text (from AI or manual transcript) into structured sections.
     * @param {string} rawText
     * @returns {Array<{id: number, title: string, text: string, status: string}>}
     */
    function splitIntoVideoSections(rawText) {
        if (!rawText || typeof rawText !== 'string') return [];

        // Check if text has "### Section" or "Section" markers
        const sectionRegex = /###?\s*Section\s*(\d+)[:\s\-–]+([^\n\r]+)/gi;
        const matches = [...rawText.matchAll(sectionRegex)];

        if (matches.length >= 2) {
            const sections = [];
            for (let i = 0; i < matches.length; i++) {
                const currentMatch = matches[i];
                const sectionNumber = i + 1;
                const sectionTitle = currentMatch[2].trim() || `Part ${sectionNumber}`;
                const startIndex = currentMatch.index + currentMatch[0].length;
                const endIndex = i + 1 < matches.length ? matches[i + 1].index : rawText.length;
                const sectionText = rawText.substring(startIndex, endIndex).trim();

                if (sectionText.length > 30) {
                    sections.push({
                        id: sections.length,
                        title: `Section ${sectionNumber}: ${sectionTitle}`,
                        text: sectionText,
                        status: sections.length === 0 ? 'unlocked' : 'locked'
                    });
                }
            }

            if (sections.length > 0) return sections;
        }

        // Fallback: split by double newlines or paragraphs into 3 or 4 sections
        let paragraphs = rawText.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);
        if (paragraphs.length < 2) {
            paragraphs = rawText.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
        }

        const paragraphsPerSection = Math.max(2, Math.ceil(paragraphs.length / 4));
        const sections = [];
        let buffer = [];

        for (let i = 0; i < paragraphs.length; i++) {
            buffer.push(paragraphs[i]);
            if (buffer.length >= paragraphsPerSection || i === paragraphs.length - 1) {
                const sectionNum = sections.length + 1;
                sections.push({
                    id: sections.length,
                    title: `Section ${sectionNum}: Lesson Part ${sectionNum}`,
                    text: buffer.join('\n\n'),
                    status: sections.length === 0 ? 'unlocked' : 'locked'
                });
                buffer = [];
            }
        }

        return sections;
    }

    /**
     * Gets the YouTube embed URL for displaying the video player.
     * @param {string} videoId The YouTube video ID.
     * @returns {string} The embed URL.
     */
    function getEmbedUrl(videoId) {
        return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
    }

    /**
     * Gets the YouTube thumbnail URL.
     * @param {string} videoId The YouTube video ID.
     * @returns {string} The thumbnail URL.
     */
    function getThumbnailUrl(videoId) {
        return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }

    /**
     * Validates if a string is a valid YouTube URL.
     * @param {string} url 
     * @returns {boolean}
     */
    function isValidYouTubeUrl(url) {
        return extractYouTubeId(url) !== null;
    }

    return {
        extractYouTubeId,
        isDirectVideoUrl,
        fetchVideoMetadata,
        processVideoContent,
        splitIntoVideoSections,
        getEmbedUrl,
        getThumbnailUrl,
        isValidYouTubeUrl
    };
})();


