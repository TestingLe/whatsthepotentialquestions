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
     * @returns {Promise<Array>} An array of quiz question objects.
     */
    async function generateQuiz(sectionText, sectionId) {
        if (!sectionText || !sectionId) {
            throw new Error("Section text and section ID are required.");
        }

        const cacheKey = `quiz_cache_${sectionId}`;
        const cached = localStorage.getItem(cacheKey);
        
        if (cached) {
            try {
                return JSON.parse(cached);
            } catch (e) {
                console.warn('Invalid cache data found. Regenerating quiz.');
                localStorage.removeItem(cacheKey);
            }
        }

        const prompt = `You are an expert educator creating multiple-choice quiz questions to test reading comprehension, not just rote recall.
Based on the following text section, generate exactly 5 multiple-choice questions.
The wrong answers should be plausible but clearly incorrect.

VERY IMPORTANT: The correct answer MUST be randomly distributed among A, B, C, and D. Do NOT make every correct answer "A". Vary the positions so roughly each letter gets at least one correct answer across the 5 questions. For example: question 1 correct=C, question 2 correct=A, question 3 correct=D, question 4 correct=B, question 5 correct=C.

Text Section:
${sectionText}

Return ONLY valid JSON (no markdown fences, no extra text).
The output MUST be an array of objects matching this exact structure:
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
    "explanation": "Explanation of why this answer is correct and others are not."
  }
]

Remember: RANDOMIZE which letter (A, B, C, or D) is correct for each question. Do NOT default to A.`;

        const aiResponseText = await callAIWithRetry(prompt);
        const quizData = extractJSON(aiResponseText);

        if (!Array.isArray(quizData) || quizData.length === 0) {
            throw new Error("AI did not return a valid array of questions.");
        }

        // Shuffle correct answer positions as a safety net in case AI still biases toward A
        const shuffledQuiz = quizData.map(q => shuffleOptions(q));

        // Cache the successful result
        localStorage.setItem(cacheKey, JSON.stringify(shuffledQuiz));
        return shuffledQuiz;
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
