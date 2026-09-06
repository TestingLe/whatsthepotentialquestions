/**
 * WhatsThePotentialQuestions — Main Application Controller
 * Orchestrates file upload, quiz generation, progressive sections, and UI.
 */
(function () {
    'use strict';

    // ── App State ──
    const state = {
        sections: [],
        currentSectionIndex: 0,
        currentQuiz: null,
        userAnswers: {},
        quizSubmitted: false,
        progressTracker: null,
        fileName: '',
        isLoading: false
    };

    // ── DOM References (populated on init) ──
    let dom = {};

    // ── Initialize ──
    function init() {
        cacheDom();
        bindEvents();
        console.log('WhatsThePotentialQuestions initialized!');
    }

    function cacheDom() {
        dom = {
            // Landing
            landing: document.getElementById('landing'),
            dropZone: document.getElementById('drop-zone'),
            fileInput: document.getElementById('file-input'),
            browseBtn: document.getElementById('browse-btn'),

            // Study view
            studyView: document.getElementById('study-view'),
            sidebar: document.getElementById('sidebar'),
            sectionList: document.getElementById('section-list'),
            progressBarFill: document.getElementById('progress-bar-fill'),
            progressText: document.getElementById('progress-text'),
            docTitle: document.getElementById('doc-title'),

            // Quiz area
            quizArea: document.getElementById('quiz-area'),
            quizSectionTitle: document.getElementById('quiz-section-title'),
            questionsContainer: document.getElementById('questions-container'),
            submitBtn: document.getElementById('submit-quiz-btn'),
            quizActions: document.getElementById('quiz-actions'),

            // Score
            scoreDisplay: document.getElementById('score-display'),
            scoreValue: document.getElementById('score-value'),
            scoreMessage: document.getElementById('score-message'),
            retryBtn: document.getElementById('retry-btn'),
            nextBtn: document.getElementById('next-btn'),

            // Loading
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingText: document.getElementById('loading-text'),

            // Toast
            toastContainer: document.getElementById('toast-container'),

            // Back button
            backBtn: document.getElementById('back-btn'),

            // Locked message
            lockedMessage: document.getElementById('locked-message')
        };
    }

    function bindEvents() {
        // Drag & Drop
        dom.dropZone.addEventListener('dragover', handleDragOver);
        dom.dropZone.addEventListener('dragleave', handleDragLeave);
        dom.dropZone.addEventListener('drop', handleDrop);
        dom.dropZone.addEventListener('click', () => dom.fileInput.click());
        dom.browseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.fileInput.click();
        });
        dom.fileInput.addEventListener('change', handleFileSelect);

        // Quiz actions
        dom.submitBtn.addEventListener('click', submitQuiz);
        dom.retryBtn.addEventListener('click', retryQuiz);
        dom.nextBtn.addEventListener('click', goToNextSection);
        dom.backBtn.addEventListener('click', goBackToLanding);
    }

    // ── Drag & Drop Handlers ──
    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        dom.dropZone.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        dom.dropZone.classList.remove('drag-over');
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        dom.dropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    }

    function handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    }

    // ── File Processing ──
    async function processFile(file) {
        showLoading('Reading your file...');
        try {
            state.fileName = file.name;

            // Parse the file
            showLoading('Extracting text from document...');
            const text = await FileParser.parseFile(file);

            if (!text || text.trim().length < 50) {
                throw new Error('The document appears to be empty or has very little text content.');
            }

            // Split into sections
            showLoading('Splitting into study sections...');
            state.sections = await FileParser.splitIntoSections(text, 4);

            if (state.sections.length === 0) {
                throw new Error('Could not split the document into sections.');
            }

            // Initialize progress tracker
            const docId = ProgressTracker.generateDocumentId(file.name, text);
            state.progressTracker = new ProgressTracker(docId);
            state.progressTracker.initSections(state.sections.length);

            // Sync section statuses from saved progress
            state.sections.forEach((section, i) => {
                const savedStatus = state.progressTracker.getSectionStatus(i);
                if (savedStatus) {
                    section.status = savedStatus;
                }
            });

            // Switch to study view
            hideLoading();
            showStudyView();
            showToast(`📄 Loaded "${file.name}" — ${state.sections.length} sections found!`, 'success');

            // Auto-load the first unlocked/uncompleted section
            const firstActive = state.sections.findIndex(s => s.status === 'unlocked');
            if (firstActive >= 0) {
                selectSection(firstActive);
            } else {
                selectSection(0);
            }
        } catch (error) {
            hideLoading();
            showToast(`❌ ${error.message}`, 'error');
            console.error('File processing error:', error);
        }
    }

    // ── View Switching ──
    function showStudyView() {
        dom.landing.classList.add('hidden');
        dom.studyView.classList.remove('hidden');
        dom.docTitle.textContent = state.fileName;
        renderSidebar();
        updateProgressBar();
    }

    function goBackToLanding() {
        dom.studyView.classList.add('hidden');
        dom.landing.classList.remove('hidden');
        // Reset state
        state.sections = [];
        state.currentSectionIndex = 0;
        state.currentQuiz = null;
        state.userAnswers = {};
        state.quizSubmitted = false;
        state.progressTracker = null;
        state.fileName = '';
        dom.fileInput.value = '';
    }

    // ── Sidebar ──
    function renderSidebar() {
        dom.sectionList.innerHTML = '';
        state.sections.forEach((section, index) => {
            const status = state.progressTracker
                ? state.progressTracker.getSectionStatus(index) || section.status
                : section.status;
            const progress = state.progressTracker
                ? state.progressTracker.getSectionProgress(index)
                : null;

            const item = document.createElement('div');
            item.className = `section-item ${status}`;
            if (index === state.currentSectionIndex) {
                item.classList.add('active');
            }

            let icon = '🔒';
            if (status === 'unlocked') icon = '🔓';
            if (status === 'completed') icon = '✅';

            let subtitle = '';
            if (progress && progress.attempts > 0) {
                subtitle = `<span class="section-subtitle">Best: ${progress.bestScore}/5 · ${progress.attempts} attempt${progress.attempts !== 1 ? 's' : ''}</span>`;
            }

            item.innerHTML = `
                <span class="section-icon">${icon}</span>
                <div class="section-info">
                    <span class="section-name">Section ${index + 1}</span>
                    ${subtitle}
                </div>
            `;

            if (status !== 'locked') {
                item.addEventListener('click', () => selectSection(index));
            }

            dom.sectionList.appendChild(item);
        });
    }

    function updateProgressBar() {
        if (!state.progressTracker) return;
        const progress = state.progressTracker.getOverallProgress();
        dom.progressBarFill.style.width = `${progress.percentage}%`;
        dom.progressText.textContent = `${progress.completed}/${progress.total} sections completed`;
    }

    // ── Section Selection ──
    async function selectSection(index) {
        const section = state.sections[index];
        const status = state.progressTracker
            ? state.progressTracker.getSectionStatus(index) || section.status
            : section.status;

        if (status === 'locked') {
            showToast('🔒 Complete the previous section first!', 'error');
            return;
        }

        state.currentSectionIndex = index;
        state.userAnswers = {};
        state.quizSubmitted = false;
        state.currentQuiz = null;

        renderSidebar();

        // Show quiz area, hide score and locked
        dom.quizArea.classList.remove('hidden');
        dom.scoreDisplay.classList.add('hidden');
        dom.lockedMessage.classList.add('hidden');
        dom.quizSectionTitle.textContent = `Section ${index + 1}`;

        // Generate quiz
        await loadQuiz(index);
    }

    async function regenerateQuiz() {
        if (state.isLoading) return;
        const sectionIndex = state.currentSectionIndex;
        const docId = state.progressTracker.documentId;
        const quizId = `${docId}_section_${sectionIndex}`;

        // Clear cache for this section so it generates fresh questions
        QuizEngine.clearSectionCache(quizId);

        // Reset quiz state
        state.userAnswers = {};
        state.quizSubmitted = false;
        state.currentQuiz = null;

        showToast('🔄 Generating new questions...', 'info');
        await loadQuiz(sectionIndex);
    }

    async function loadQuiz(sectionIndex) {
        const section = state.sections[sectionIndex];
        showLoading('🤖 Generating quiz questions...');

        try {
            const docId = state.progressTracker.documentId;
            const quizId = `${docId}_section_${sectionIndex}`;
            const quiz = await QuizEngine.generateQuiz(section.text, quizId);
            state.currentQuiz = quiz;
            hideLoading();
            renderQuiz(quiz);
        } catch (error) {
            hideLoading();
            showToast(`❌ Failed to generate quiz: ${error.message}`, 'error');
            console.error('Quiz generation error:', error);
            dom.questionsContainer.innerHTML = `
                <div class="error-message">
                    <p>😔 Failed to generate quiz questions.</p>
                    <p>${error.message}</p>
                    <button class="btn-primary" onclick="location.reload()">Try Again</button>
                </div>
            `;
        }
    }

    // ── Quiz Rendering ──
    function renderQuiz(quiz) {
        dom.questionsContainer.innerHTML = '';
        dom.submitBtn.classList.remove('hidden');
        dom.quizActions.classList.add('hidden');
        dom.scoreDisplay.classList.add('hidden');

        // Add regenerate button at the top
        const regenContainer = document.createElement('div');
        regenContainer.className = 'regen-container';
        regenContainer.innerHTML = `
            <button class="btn-regen" id="regen-btn">
                <i class="fa-solid fa-arrows-rotate"></i> Regenerate Questions
            </button>
        `;
        dom.questionsContainer.appendChild(regenContainer);

        // Bind regenerate button
        document.getElementById('regen-btn').addEventListener('click', regenerateQuiz);

        quiz.forEach((q, qIndex) => {
            const card = document.createElement('div');
            card.className = 'question-card';
            card.style.animationDelay = `${qIndex * 0.1}s`;

            const optionsHTML = Object.entries(q.options).map(([key, value]) => `
                <button class="option-btn" data-question="${qIndex}" data-option="${key}">
                    <span class="option-key">${key}</span>
                    <span class="option-text">${value}</span>
                </button>
            `).join('');

            card.innerHTML = `
                <div class="question-number">Question ${qIndex + 1}</div>
                <p class="question-text">${q.question}</p>
                <div class="options-grid">
                    ${optionsHTML}
                </div>
                <div class="explanation hidden" id="explanation-${qIndex}">
                    <span class="explanation-icon">💡</span>
                    <p>${q.explanation}</p>
                </div>
            `;

            dom.questionsContainer.appendChild(card);
        });

        // Bind option clicks
        document.querySelectorAll('.option-btn').forEach(btn => {
            btn.addEventListener('click', handleOptionClick);
        });
    }

    function handleOptionClick(e) {
        if (state.quizSubmitted) return;

        const btn = e.currentTarget;
        const questionIndex = btn.dataset.question;
        const option = btn.dataset.option;

        // Deselect other options for this question
        document.querySelectorAll(`.option-btn[data-question="${questionIndex}"]`).forEach(b => {
            b.classList.remove('selected');
        });

        // Select this option
        btn.classList.add('selected');
        state.userAnswers[questionIndex] = option;

        // Check if all questions answered
        const allAnswered = state.currentQuiz.every((_, i) => state.userAnswers[i] !== undefined);
        if (allAnswered) {
            dom.submitBtn.classList.add('ready');
        }
    }

    // ── Quiz Submission ──
    function submitQuiz() {
        if (!state.currentQuiz) return;

        // Check if all questions answered
        const unanswered = state.currentQuiz.filter((_, i) => state.userAnswers[i] === undefined);
        if (unanswered.length > 0) {
            showToast(`⚠️ Please answer all ${unanswered.length} remaining question${unanswered.length > 1 ? 's' : ''}.`, 'error');
            return;
        }

        state.quizSubmitted = true;
        let score = 0;

        // Grade each question
        state.currentQuiz.forEach((q, i) => {
            const userAnswer = state.userAnswers[i];
            const isCorrect = userAnswer === q.correctAnswer;
            if (isCorrect) score++;

            // Mark options
            document.querySelectorAll(`.option-btn[data-question="${i}"]`).forEach(btn => {
                btn.classList.remove('selected');
                btn.disabled = true;

                if (btn.dataset.option === q.correctAnswer) {
                    btn.classList.add('correct');
                } else if (btn.dataset.option === userAnswer && !isCorrect) {
                    btn.classList.add('incorrect');
                }
            });

            // Show explanation if wrong
            if (!isCorrect) {
                const explanation = document.getElementById(`explanation-${i}`);
                if (explanation) explanation.classList.remove('hidden');
            }
        });

        // Record attempt
        const result = state.progressTracker.recordAttempt(
            state.currentSectionIndex,
            score,
            state.currentQuiz.length
        );

        // Show score
        showScore(score, state.currentQuiz.length, result);

        // Update sidebar
        renderSidebar();
        updateProgressBar();

        // Hide submit, show actions
        dom.submitBtn.classList.add('hidden');
        dom.quizActions.classList.remove('hidden');

        if (result.perfect) {
            dom.retryBtn.classList.add('hidden');
            if (result.unlocked !== null) {
                dom.nextBtn.classList.remove('hidden');
            } else {
                // Check if all sections completed
                const progress = state.progressTracker.getOverallProgress();
                if (progress.completed === progress.total) {
                    dom.nextBtn.classList.add('hidden');
                } else {
                    dom.nextBtn.classList.add('hidden');
                }
            }
        } else {
            dom.retryBtn.classList.remove('hidden');
            dom.nextBtn.classList.add('hidden');
        }
    }

    function showScore(score, total, result) {
        dom.scoreDisplay.classList.remove('hidden');
        dom.scoreValue.textContent = `${score}/${total}`;

        dom.scoreDisplay.className = 'score-display';
        if (result.perfect) {
            dom.scoreDisplay.classList.add('score-perfect');
            if (result.unlocked !== null) {
                dom.scoreMessage.textContent = `🎉 Perfect! Section ${result.unlocked + 1} is now unlocked!`;
            } else {
                const progress = state.progressTracker.getOverallProgress();
                if (progress.completed === progress.total) {
                    dom.scoreMessage.textContent = '🏆 Amazing! You\'ve completed the entire document!';
                } else {
                    dom.scoreMessage.textContent = '🎉 Perfect score! Well done!';
                }
            }
            createConfetti();
        } else {
            dom.scoreDisplay.classList.add('score-fail');
            dom.scoreMessage.textContent = `You got ${score} out of ${total}. Review the explanations and try again! 💪`;
        }

        // Scroll to score
        dom.scoreDisplay.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ── Quiz Actions ──
    function retryQuiz() {
        state.userAnswers = {};
        state.quizSubmitted = false;
        renderQuiz(state.currentQuiz);
        dom.questionsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function goToNextSection() {
        const nextIndex = state.currentSectionIndex + 1;
        if (nextIndex < state.sections.length) {
            selectSection(nextIndex);
            dom.quizArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // ── Loading Overlay ──
    function showLoading(text = 'Loading...') {
        state.isLoading = true;
        dom.loadingOverlay.classList.remove('hidden');
        dom.loadingText.textContent = text;
    }

    function hideLoading() {
        state.isLoading = false;
        dom.loadingOverlay.classList.add('hidden');
    }

    // ── Toast Notifications ──
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        dom.toastContainer.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => toast.classList.add('show'));

        // Auto dismiss
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ── Confetti Effect ──
    function createConfetti() {
        const colors = ['#667eea', '#764ba2', '#00d4aa', '#f093fb', '#ffd700', '#ff6b6b'];
        const confettiContainer = document.createElement('div');
        confettiContainer.className = 'confetti-container';
        document.body.appendChild(confettiContainer);

        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti-piece';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            confetti.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
            confettiContainer.appendChild(confetti);
        }

        setTimeout(() => confettiContainer.remove(), 4000);
    }

    // ── Initialize on DOM ready ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
