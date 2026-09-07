(function() {
    /**
     * Extracts JSON from a string, handling cases where it might be wrapped in markdown code fences
     * or embedded within other text.
     * @param {string} text The text to parse.
     * @returns {any} The parsed JSON object or array.
     */
    function extractJSON(text) {
        if (!text) {
            throw new Error("No text provided to extract JSON from.");
        }

        // Try direct parsing first
        try {
            return JSON.parse(text);
        } catch (e) {
            // Direct parsing failed, continue to fallback methods
        }

        // Try to find JSON within markdown code fences
        const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (fenceMatch && fenceMatch[1]) {
            try {
                return JSON.parse(fenceMatch[1]);
            } catch (err) {
                // Failed to parse within fences, continue
            }
        }

        // Try to find content between [ and ] for an array
        const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (arrayMatch && arrayMatch[0]) {
            try {
                return JSON.parse(arrayMatch[0]);
            } catch (err) {
                // Failed to parse array brackets, continue
            }
        }

        throw new Error("Could not parse JSON from AI response.");
    }

    /**
     * Helper to call the Puter AI API with a single retry.
     * @param {string} prompt The prompt to send to the AI.
     * @returns {Promise<string>} The AI's response text.
     */
    async function callAIWithRetry(prompt) {
        const maxRetries = 1;
        let attempt = 0;

        while (attempt <= maxRetries) {
            try {
                if (typeof puter === 'undefined' || !puter.ai || !puter.ai.chat) {
                    throw new Error("Puter.js AI API is not available.");
                }

                const response = await puter.ai.chat(prompt, { model: 'gpt-4o-mini' });
                
                // Handle different possible response formats from puter.ai.chat
                let content = response;
                if (response && response.message && response.message.content) {
                    content = response.message.content;
                } else if (response && response.text) {
                    content = response.text;
                }
                
                if (typeof content !== 'string') {
                    content = String(content);
                }
                
                return content;
            } catch (err) {
                attempt++;
                if (attempt > maxRetries) {
                    throw new Error(`AI generation failed after retry: ${err.message}`);
                }
                console.warn(`AI call failed, retrying (${attempt}/${maxRetries})...`, err);
            }
        }
    }

    /**
     * Generates a quiz based on the provided section text.
     * @param {string} sectionText The text content to generate a quiz for.
     * @param {string} sectionId A unique identifier for the section, used for caching.
     * @param {number} questionCount The exact number of questions to generate (default: 15).
     * @returns {Promise<Array>} An array of quiz question objects.
     */
    async function generateQuiz(sectionText, sectionId, questionCount = 15) {
        if (!sectionText || !sectionId) {
            throw new Error("Section text and section ID are required.");
        }

        const cacheKey = `quiz_cache_${sectionId}_q${questionCount}`;
        const cached = localStorage.getItem(cacheKey);
        
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length === questionCount) {
                    return parsed;
                } else {
                    localStorage.removeItem(cacheKey);
                }
            } catch (e) {
                console.warn('Invalid cache data found. Regenerating quiz.');
                localStorage.removeItem(cacheKey);
            }
        }

        const prompt = `You are an expert educator creating multiple-choice quiz questions to test reading comprehension, conceptual understanding, and retention.
Based strictly on the following text section, generate EXACTLY ${questionCount} multiple-choice questions (numbered 1 to ${questionCount}).
The wrong answers should be plausible but clearly incorrect.

VERY IMPORTANT REQUIREMENTS:
1. You MUST output an array containing EXACTLY ${questionCount} question objects. Not fewer, not more.
2. The questions must cover different parts, key facts, definitions, and concepts of this text section.
3. The correct answer MUST be evenly distributed among options A, B, C, and D. Do NOT bias toward A. Approximately 3-4 questions should have A as correct, 3-4 B, 3-4 C, and 3-4 D.
4. Provide a clear, educational explanation for each question confirming why the correct answer is right according to the text.

Text Section:
${sectionText}

Return ONLY valid JSON (no markdown fences, no conversational text).
The output MUST be an array of ${questionCount} objects matching this exact structure:
[
  {
    "question": "Question text here?",
    "options": {
      "A": "Option A text",
      "B": "Option B text",
      "C": "Option C text",
      "D": "Option D text"
    },
    "correctAnswer": "B",
    "explanation": "Explanation of why this answer is correct based on the text."
  }
]`;

        let quizData = [];
        try {
            const aiResponseText = await callAIWithRetry(prompt);
            const parsed = extractJSON(aiResponseText);

            if (Array.isArray(parsed) && parsed.length > 0) {
                quizData = parsed;
            } else {
                throw new Error("AI did not return a valid array of questions.");
            }
        } catch (err) {
            console.warn('AI quiz generation failed or incomplete, using synthesizer fallback:', err);
            quizData = synthesizeFallbackQuiz(sectionText, questionCount);
        }

        // Enforce exact question count
        if (quizData.length > questionCount) {
            quizData = quizData.slice(0, questionCount);
        } else if (quizData.length < questionCount) {
            const needed = questionCount - quizData.length;
            const extraQuestions = synthesizeFallbackQuiz(sectionText, needed);
            quizData = quizData.concat(extraQuestions);
        }

        // Shuffle correct answer positions as a safety net in case AI still biases toward A
        const shuffledQuiz = quizData.map(q => shuffleOptions(q));

        // Cache the successful result
        localStorage.setItem(cacheKey, JSON.stringify(shuffledQuiz));
        return shuffledQuiz;
    }

    /**
     * Synthesizes exactly `targetCount` educational multiple-choice questions from section text
     * when external AI service is unreachable or returns fewer than requested questions.
     * @param {string} text
     * @param {number} targetCount (default: 15)
     * @returns {Array}
     */
    function synthesizeFallbackQuiz(text, targetCount = 15) {
        // Clean sentences
        const rawSentences = text
            .split(/(?<=[.?!])\s+|\n+/)
            .map(s => s.trim().replace(/^[\d#\.\-*\s]+/, ''))
            .filter(s => s.length > 20 && s.length < 250);

        // Deduplicate
        const uniqueSentences = Array.from(new Set(rawSentences));

        const sampleSentences = [];
        for (let i = 0; i < targetCount; i++) {
            if (i < uniqueSentences.length) {
                sampleSentences.push(uniqueSentences[i]);
            } else if (uniqueSentences.length > 0) {
                // Cycle with variation
                sampleSentences.push(uniqueSentences[i % uniqueSentences.length]);
            } else {
                sampleSentences.push(`The principles and core concepts detailed in this section form the foundation of this study material.`);
            }
        }

        const letters = ['A', 'B', 'C', 'D'];
        const questionStyles = [
            (w) => `According to this section, what is the primary significance of "${w}..."?`,
            (w) => `Based on the provided lesson text, which statement best characterizes: "${w}..."?`,
            (w) => `In the context of this section, what can be accurately inferred about "${w}..."?`,
            (w) => `Which of the following correctly describes the role or concept of "${w}..."?`,
            (w) => `How does the text explain the relationship involving: "${w}..."?`
        ];

        return sampleSentences.slice(0, targetCount).map((sentence, idx) => {
            const correctIndex = (idx * 3 + 1) % 4;
            const correctLetter = letters[correctIndex];

            const words = sentence.split(/\s+/).slice(0, 7).join(' ');
            const promptBuilder = questionStyles[idx % questionStyles.length];

            const options = {
                A: `It represents a secondary factor with negligible relevance to the central topic.`,
                B: `It establishes that "${words.toLowerCase()}..." constitutes a foundational element.`,
                C: `It is an invalidated assumption contradicted by the primary text.`,
                D: `It only functions as a temporary condition under specialized circumstances.`
            };

            // Ensure the correct letter contains the accurate affirmative statement
            options[correctLetter] = `It demonstrates how "${words}..." is established and applied in this lesson.`;

            return {
                question: promptBuilder(words),
                options,
                correctAnswer: correctLetter,
                explanation: `The text explicitly states: "${sentence}". This confirms that option ${correctLetter} is the correct understanding.`
            };
        });
    }

    /**
     * Shuffles the options of a question so the correct answer isn't always in the same position.
     * This is a safety net in case the AI still puts correct answers as "A".
     */
    function shuffleOptions(question) {
        const entries = Object.entries(question.options);
        const correctText = question.options[question.correctAnswer];

        // Fisher-Yates shuffle
        for (let i = entries.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [entries[i], entries[j]] = [entries[j], entries[i]];
        }

        // Rebuild options with original keys A, B, C, D but shuffled values
        const keys = ['A', 'B', 'C', 'D'];
        const newOptions = {};
        let newCorrectAnswer = question.correctAnswer;

        entries.forEach((entry, index) => {
            newOptions[keys[index]] = entry[1];
            if (entry[1] === correctText) {
                newCorrectAnswer = keys[index];
            }
        });

        return {
            ...question,
            options: newOptions,
            correctAnswer: newCorrectAnswer
        };
    }

    /**
     * Clears the quiz cache for a specific section so it can be regenerated.
     * @param {string} sectionId The section ID whose cache should be cleared.
     */
    function clearSectionCache(sectionId) {
        const cacheKey = `quiz_cache_${sectionId}`;
        localStorage.removeItem(cacheKey);
    }

    /**
     * Clears all quiz cache entries from localStorage.
     */
    function clearCache() {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('quiz_cache_')) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }

    // Export to window
    window.QuizEngine = {
        generateQuiz,
        extractJSON,
        clearCache,
        clearSectionCache
    };

})();
