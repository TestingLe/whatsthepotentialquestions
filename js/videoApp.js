/**
 * WhatsThePotentialQuestions — Video Quizzes Application Controller
 * Handles YouTube & video link parsing, study sections, video player embedding,
 * AI quiz generation, progressive unlocking, and practice history.
 */
(function () {
    'use strict';

    // ── Pre-configured Educational Presets ──
    const PRESETS = [
        {
            title: "Neural Networks & Deep Learning",
            channel: "3Blue1Brown",
            url: "https://www.youtube.com/watch?v=aircAruvnKk",
            id: "aircAruvnKk",
            tag: "AI & Tech"
        },
        {
            title: "Intro to Economics",
            channel: "CrashCourse",
            url: "https://www.youtube.com/watch?v=3ez10ADR_gM",
            id: "3ez10ADR_gM",
            tag: "Economics"
        },
        {
            title: "The Map of Quantum Physics",
            channel: "Domain of Science",
            url: "https://www.youtube.com/watch?v=TQKELOVhnEU",
            id: "TQKELOVhnEU",
            tag: "Physics"
        },
        {
            title: "DNA & Molecular Genetics",
            channel: "Khan Academy",
            url: "https://www.youtube.com/watch?v=8kK2zwjRV0M",
            id: "8kK2zwjRV0M",
            tag: "Biology"
        }
    ];

    // ── Application State ──
    const state = {
        videoUrl: '',
        videoId: null,
        videoMeta: { title: '', author: '', thumbnail: '' },
        sections: [],
        currentSectionIndex: 0,
        currentQuiz: null,
        userAnswers: {},
        quizSubmitted: false,
        progressTracker: null,
        isLoading: false
    };

    // ── DOM References ──
    let dom = {};

    function init() {
        cacheDom();
        bindEvents();
        renderPresets();
        renderRecentVideos();
        console.log('Video Quizzes App initialized!');
    }

    function cacheDom() {
        dom = {
            // Landing
            landing: document.getElementById('landing'),
            videoUrlInput: document.getElementById('video-url-input'),
            videoSubmitBtn: document.getElementById('video-submit-btn'),
            presetsContainer: document.getElementById('presets-container'),
            recentList: document.getElementById('recent-list'),
            recentSection: document.getElementById('recent-section'),

            // Manual transcript
            manualToggleBtn: document.getElementById('manual-toggle-btn'),
            manualTranscriptBox: document.getElementById('manual-transcript-box'),
            manualTextInput: document.getElementById('manual-text-input'),
            manualSubmitBtn: document.getElementById('manual-submit-btn'),

            // Study view
            studyView: document.getElementById('study-view'),
            backBtn: document.getElementById('back-btn'),
            videoTitleEl: document.getElementById('video-title-el'),
            videoMetaEl: document.getElementById('video-meta-el'),
            progressBarFill: document.getElementById('progress-bar-fill'),
            progressText: document.getElementById('progress-text'),

            // Video player container
            videoFrameWrapper: document.getElementById('video-frame-wrapper'),

            // Sections & Quiz
            sectionList: document.getElementById('section-list'),
            quizArea: document.getElementById('quiz-area'),
            quizSectionTitle: document.getElementById('quiz-section-title'),
            questionsContainer: document.getElementById('questions-container'),
            submitBtn: document.getElementById('submit-quiz-btn'),
            quizActions: document.getElementById('quiz-actions'),
            scoreDisplay: document.getElementById('score-display'),
            scoreValue: document.getElementById('score-value'),
            scoreMessage: document.getElementById('score-message'),
            retryBtn: document.getElementById('retry-btn'),
            nextBtn: document.getElementById('next-btn'),
            lockedMessage: document.getElementById('locked-message'),

            // Overlays
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingText: document.getElementById('loading-text'),
            toastContainer: document.getElementById('toast-container')
        };
    }

    function bindEvents() {
        // Form submissions
        dom.videoSubmitBtn.addEventListener('click', handleVideoSubmit);
        dom.videoUrlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleVideoSubmit();
        });

        // Manual transcript toggle & submit
        if (dom.manualToggleBtn) {
            dom.manualToggleBtn.addEventListener('click', () => {
                dom.manualTranscriptBox.classList.toggle('hidden');
                dom.manualToggleBtn.classList.toggle('active');
            });
        }
        if (dom.manualSubmitBtn) {
            dom.manualSubmitBtn.addEventListener('click', handleManualSubmit);
        }

        // Quiz actions
        dom.submitBtn.addEventListener('click', submitQuiz);
        dom.retryBtn.addEventListener('click', retryQuiz);
        dom.nextBtn.addEventListener('click', goToNextSection);
        dom.backBtn.addEventListener('click', goBackToLanding);
    }

    // ── Render Educational Presets ──
    function renderPresets() {
        if (!dom.presetsContainer) return;
        dom.presetsContainer.innerHTML = '';

        PRESETS.forEach(preset => {
            const card = document.createElement('div');
            card.className = 'preset-chip';
            card.innerHTML = `
                <div class="preset-badge">${preset.tag}</div>
                <div class="preset-content">
                    <strong class="preset-title">${preset.title}</strong>
                    <span class="preset-channel"><i class="fa-brands fa-youtube" style="color: #ff5252;"></i> ${preset.channel}</span>
                </div>
            `;
            card.addEventListener('click', () => {
                dom.videoUrlInput.value = preset.url;
                processVideoUrl(preset.url, preset);
            });
            dom.presetsContainer.appendChild(card);
        });
    }

    // ── Video Submission Handlers ──
    function handleVideoSubmit() {
        const url = dom.videoUrlInput.value.trim();
        if (!url) {
            showToast('⚠️ Please enter a YouTube video URL.', 'error');
            return;
        }
        processVideoUrl(url);
    }

    function handleManualSubmit() {
        const text = dom.manualTextInput.value.trim();
        const url = dom.videoUrlInput.value.trim() || 'https://www.youtube.com/watch?v=manual';
        if (!text || text.length < 100) {
            showToast('⚠️ Please paste a detailed transcript or lesson notes (at least 100 characters).', 'error');
            return;
        }

        const videoId = VideoParser.extractYouTubeId(url);
        processManualContent(url, videoId, text);
    }

    // ── Main Video Processing Pipeline ──
    async function processVideoUrl(url, presetHint = null) {
        const videoId = VideoParser.extractYouTubeId(url);
        const isDirect = VideoParser.isDirectVideoUrl(url);

        if (!videoId && !isDirect) {
            showToast('❌ Please provide a valid YouTube URL (e.g. youtube.com/watch?v=... or youtu.be/...)', 'error');
            return;
        }

        state.videoUrl = url;
        state.videoId = videoId;

        showLoading('Connecting to video metadata...');
        try {
            // 1. Fetch metadata (Title, Author, Thumbnail)
            let metadata = presetHint ? {
                title: presetHint.title,
                author: presetHint.channel,
                thumbnail: VideoParser.getThumbnailUrl(presetHint.id)
            } : await VideoParser.fetchVideoMetadata(url, videoId);

            state.videoMeta = metadata;

            // 2. Generate structured sections & educational content via AI
            showLoading(`Generating structured lesson & quiz for "${metadata.title}"...`);
            const sections = await VideoParser.processVideoContent(videoId, url, metadata);

            if (!sections || sections.length === 0) {
                throw new Error('Could not split the video material into study sections.');
            }

            state.sections = sections;

            // 3. Initialize ProgressTracker
            const docId = `video_${videoId || btoa(url).substring(0, 16)}`;
            state.progressTracker = new ProgressTracker(docId);
            state.progressTracker.initSections(state.sections.length);

            // Sync saved statuses
            state.sections.forEach((section, i) => {
                const savedStatus = state.progressTracker.getSectionStatus(i);
                if (savedStatus) {
                    section.status = savedStatus;
                }
            });

            // Save to recent practice list
            saveToRecent(url, metadata, videoId);

            // 4. Switch to study view
            hideLoading();
            showStudyView();
            showToast(`🎬 Loaded "${metadata.title}" — ${state.sections.length} quiz sections ready!`, 'success');

            // Select first active section
            const firstActive = state.sections.findIndex(s => s.status === 'unlocked');
            selectSection(firstActive >= 0 ? firstActive : 0);

        } catch (error) {
            hideLoading();
            console.error('Video processing error:', error);
            showToast(`❌ ${error.message}`, 'error');

            // Open the manual transcript box if auto-extraction failed
            if (dom.manualTranscriptBox) {
                dom.manualTranscriptBox.classList.remove('hidden');
                dom.manualTranscriptBox.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }

    async function processManualContent(url, videoId, rawText) {
        showLoading('Structuring your transcript into study sections...');
        try {
            state.videoUrl = url;
            state.videoId = videoId;
            state.videoMeta = {
                title: 'Custom Video Study Lesson',
                author: 'User Provided Notes',
                thumbnail: videoId ? VideoParser.getThumbnailUrl(videoId) : ''
            };

            const sections = VideoParser.splitIntoVideoSections(rawText);
            if (!sections || sections.length === 0) {
                throw new Error('Could not parse the transcript into sections. Please add more text.');
            }

            state.sections = sections;
            const docId = `video_manual_${Date.now()}`;
            state.progressTracker = new ProgressTracker(docId);
            state.progressTracker.initSections(state.sections.length);

            hideLoading();
            showStudyView();
            showToast(`📄 Loaded manual notes — ${state.sections.length} sections generated!`, 'success');
            selectSection(0);
        } catch (err) {
            hideLoading();
            showToast(`❌ ${err.message}`, 'error');
        }
    }

    // ── View Switching ──
    function showStudyView() {
        dom.landing.classList.add('hidden');
        dom.studyView.classList.remove('hidden');

        // Update header details
        dom.videoTitleEl.textContent = state.videoMeta.title || 'Video Lesson';
        dom.videoMetaEl.textContent = state.videoMeta.author ? `by ${state.videoMeta.author}` : 'Interactive Video Study Session';
        const metaTitleEl = document.getElementById('video-meta-title');
        if (metaTitleEl) {
            metaTitleEl.textContent = state.videoMeta.title || 'Interactive Video Lecture';
        }

        // Embed video player
        embedVideoPlayer();

        // Render sidebar & progress
        renderSidebar();
        updateProgressBar();
    }

    function embedVideoPlayer() {
        dom.videoFrameWrapper.innerHTML = '';

        if (state.videoId) {
            const iframe = document.createElement('iframe');
            iframe.className = 'embedded-video-player';
            iframe.src = VideoParser.getEmbedUrl(state.videoId);
            iframe.title = state.videoMeta.title || 'YouTube Video Player';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            iframe.allowFullscreen = true;
            dom.videoFrameWrapper.appendChild(iframe);
        } else if (VideoParser.isDirectVideoUrl(state.videoUrl)) {
            const video = document.createElement('video');
            video.className = 'embedded-video-player';
            video.controls = true;
            video.src = state.videoUrl;
            dom.videoFrameWrapper.appendChild(video);
        } else {
            dom.videoFrameWrapper.innerHTML = `
                <div class="video-placeholder-card">
                    <i class="fa-solid fa-play-circle"></i>
                    <p>Playing video reference content</p>
                </div>
            `;
        }
    }

    function goBackToLanding() {
        // Stop any playing video
        dom.videoFrameWrapper.innerHTML = '';
        dom.studyView.classList.add('hidden');
        dom.landing.classList.remove('hidden');

        // Reset state
        state.sections = [];
        state.currentSectionIndex = 0;
        state.currentQuiz = null;
        state.userAnswers = {};
        state.quizSubmitted = false;
        state.progressTracker = null;

        renderRecentVideos();
    }

    // ── Sidebar & Navigation ──
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
                    <span class="section-name">${section.title || `Section ${index + 1}`}</span>
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
        dom.progressText.textContent = `${progress.completed}/${progress.total} sections mastered`;
    }

    // ── Section Selection & Quiz Loading ──
    async function selectSection(index) {
        const section = state.sections[index];
        const status = state.progressTracker
            ? state.progressTracker.getSectionStatus(index) || section.status
            : section.status;

        if (status === 'locked') {
            showToast('🔒 Complete the previous section with 100% to unlock this one!', 'error');
            return;
        }

        state.currentSectionIndex = index;
        state.userAnswers = {};
        state.quizSubmitted = false;
        state.currentQuiz = null;

        renderSidebar();

        dom.quizArea.classList.remove('hidden');
        dom.scoreDisplay.classList.add('hidden');
        dom.lockedMessage.classList.add('hidden');
        dom.quizSectionTitle.textContent = section.title || `Section ${index + 1}`;

        await loadQuiz(index);
    }

    async function regenerateQuiz() {
        if (state.isLoading) return;
        const sectionIndex = state.currentSectionIndex;
        const docId = state.progressTracker.documentId;
        const quizId = `${docId}_section_${sectionIndex}`;

        QuizEngine.clearCache();
        localStorage.removeItem(`quiz_cache_${quizId}`);

        state.userAnswers = {};
        state.quizSubmitted = false;
        state.currentQuiz = null;

        showToast('🔄 Generating fresh questions...', 'info');
        await loadQuiz(sectionIndex);
    }

    async function loadQuiz(sectionIndex) {
        const section = state.sections[sectionIndex];
        showLoading('🤖 Generating section quiz questions...');

        try {
            const docId = state.progressTracker.documentId;
            const quizId = `${docId}_section_${sectionIndex}`;
            const quiz = await QuizEngine.generateQuiz(section.text, quizId);
            state.currentQuiz = quiz;
            hideLoading();
            renderQuiz(quiz);
        } catch (error) {
            hideLoading();
            console.error('Quiz generation error:', error);
            showToast(`❌ Failed to generate quiz: ${error.message}`, 'error');
            dom.questionsContainer.innerHTML = `
                <div class="error-message">
                    <p>😔 Failed to generate quiz questions for this section.</p>
                    <p>${error.message}</p>
                    <button class="btn-primary" id="retry-gen-btn">Try Again</button>
                </div>
            `;
            document.getElementById('retry-gen-btn')?.addEventListener('click', () => loadQuiz(sectionIndex));
        }
    }

    // ── Quiz Rendering & Grading ──
    function renderQuiz(quiz) {
        dom.questionsContainer.innerHTML = '';
        dom.submitBtn.classList.remove('hidden');
        dom.quizActions.classList.add('hidden');
        dom.scoreDisplay.classList.add('hidden');

        // Regenerate button
        const regenContainer = document.createElement('div');
        regenContainer.className = 'regen-container';
        regenContainer.innerHTML = `
            <button class="btn-regen" id="regen-btn">
                <i class="fa-solid fa-arrows-rotate"></i> Regenerate Questions
            </button>
        `;
        dom.questionsContainer.appendChild(regenContainer);
        document.getElementById('regen-btn').addEventListener('click', regenerateQuiz);

        quiz.forEach((q, qIndex) => {
            const card = document.createElement('div');
            card.className = 'question-card';
            card.style.animationDelay = `${qIndex * 0.08}s`;

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

        // Option event listeners
        dom.questionsContainer.querySelectorAll('.option-btn').forEach(btn => {
            btn.addEventListener('click', handleOptionClick);
        });
    }

    function handleOptionClick(e) {
        if (state.quizSubmitted) return;

        const btn = e.currentTarget;
        const questionIndex = btn.dataset.question;
        const option = btn.dataset.option;

        dom.questionsContainer.querySelectorAll(`.option-btn[data-question="${questionIndex}"]`).forEach(b => {
            b.classList.remove('selected');
        });

        btn.classList.add('selected');
        state.userAnswers[questionIndex] = option;

        const allAnswered = state.currentQuiz.every((_, i) => state.userAnswers[i] !== undefined);
        if (allAnswered) {
            dom.submitBtn.classList.add('ready');
        }
    }

    function submitQuiz() {
        if (!state.currentQuiz) return;

        const unanswered = state.currentQuiz.filter((_, i) => state.userAnswers[i] === undefined);
        if (unanswered.length > 0) {
            showToast(`⚠️ Please answer all ${unanswered.length} remaining question${unanswered.length > 1 ? 's' : ''}.`, 'error');
            return;
        }

        state.quizSubmitted = true;
        let score = 0;

        state.currentQuiz.forEach((q, i) => {
            const userAnswer = state.userAnswers[i];
            const isCorrect = userAnswer === q.correctAnswer;
            if (isCorrect) score++;

            dom.questionsContainer.querySelectorAll(`.option-btn[data-question="${i}"]`).forEach(btn => {
                btn.classList.remove('selected');
                btn.disabled = true;

                if (btn.dataset.option === q.correctAnswer) {
                    btn.classList.add('correct');
                } else if (btn.dataset.option === userAnswer && !isCorrect) {
                    btn.classList.add('incorrect');
                }
            });

            if (!isCorrect) {
                const explanation = document.getElementById(`explanation-${i}`);
                if (explanation) explanation.classList.remove('hidden');
            }
        });

        const result = state.progressTracker.recordAttempt(
            state.currentSectionIndex,
            score,
            state.currentQuiz.length
        );

        showScore(score, state.currentQuiz.length, result);
        renderSidebar();
        updateProgressBar();

        dom.submitBtn.classList.add('hidden');
        dom.quizActions.classList.remove('hidden');

        if (result.perfect) {
            dom.retryBtn.classList.add('hidden');
            if (result.unlocked !== null) {
                dom.nextBtn.classList.remove('hidden');
            } else {
                dom.nextBtn.classList.add('hidden');
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
                    dom.scoreMessage.textContent = '🏆 Mastery achieved! You completed all video sections!';
                } else {
                    dom.scoreMessage.textContent = '🎉 Perfect score! Outstanding job!';
                }
            }
            createConfetti();
        } else {
            dom.scoreDisplay.classList.add('score-fail');
            dom.scoreMessage.textContent = `You scored ${score}/${total}. Review the explanations and try again to unlock the next part! 💪`;
        }

        dom.scoreDisplay.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

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

    // ── Local History Persistence ──
    function saveToRecent(url, meta, videoId) {
        try {
            const raw = localStorage.getItem('recent_video_quizzes');
            let list = raw ? JSON.parse(raw) : [];

            // Remove existing duplicate
            list = list.filter(item => item.url !== url);

            // Prepend new
            list.unshift({
                url,
                title: meta.title,
                author: meta.author,
                videoId,
                thumbnail: meta.thumbnail,
                timestamp: Date.now()
            });

            // Keep top 6
            list = list.slice(0, 6);
            localStorage.setItem('recent_video_quizzes', JSON.stringify(list));
        } catch (e) {
            console.warn('Could not save recent video:', e);
        }
    }

    function renderRecentVideos() {
        if (!dom.recentList || !dom.recentSection) return;

        try {
            const raw = localStorage.getItem('recent_video_quizzes');
            const list = raw ? JSON.parse(raw) : [];

            if (list.length === 0) {
                dom.recentSection.classList.add('hidden');
                return;
            }

            dom.recentSection.classList.remove('hidden');
            dom.recentList.innerHTML = '';

            list.forEach(item => {
                const card = document.createElement('div');
                card.className = 'recent-card';
                card.innerHTML = `
                    <div class="recent-thumb-wrapper">
                        <img src="${item.thumbnail || 'data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 9\"><rect width=\"16\" height=\"9\" fill=\"%23252542\"/></svg>'}" alt="Thumbnail" class="recent-thumb">
                        <div class="recent-play-icon"><i class="fa-solid fa-play"></i></div>
                    </div>
                    <div class="recent-info">
                        <h4 class="recent-title">${item.title}</h4>
                        <p class="recent-author">${item.author || 'Video Lesson'}</p>
                    </div>
                `;
                card.addEventListener('click', () => {
                    dom.videoUrlInput.value = item.url;
                    processVideoUrl(item.url, { title: item.title, channel: item.author, id: item.videoId });
                });
                dom.recentList.appendChild(card);
            });
        } catch (e) {
            console.warn('Could not load recent videos:', e);
        }
    }

    // ── Helpers: Loading, Toast, Confetti ──
    function showLoading(text = 'Loading...') {
        state.isLoading = true;
        dom.loadingOverlay.classList.remove('hidden');
        dom.loadingText.textContent = text;
    }

    function hideLoading() {
        state.isLoading = false;
        dom.loadingOverlay.classList.add('hidden');
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        dom.toastContainer.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    function createConfetti() {
        const colors = ['#667eea', '#764ba2', '#00d4aa', '#f093fb', '#ffd700', '#ff6b6b'];
        const container = document.createElement('div');
        container.className = 'confetti-container';
        document.body.appendChild(container);

        for (let i = 0; i < 50; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = Math.random() * 100 + '%';
            piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            piece.style.animationDelay = Math.random() * 0.5 + 's';
            piece.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
            container.appendChild(piece);
        }

        setTimeout(() => container.remove(), 4000);
    }

    // ── Init on DOM ready ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
