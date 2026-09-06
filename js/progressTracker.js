class ProgressTracker {
    constructor(documentId) {
        this.documentId = documentId;
        this.sections = [];
        this.load();
    }

    initSections(count) {
        if (this.sections.length > 0) return;
        
        for (let i = 0; i < count; i++) {
            this.sections.push({
                id: i,
                status: i === 0 ? 'unlocked' : 'locked',
                bestScore: 0,
                attempts: 0
            });
        }
        this.save();
    }

    getSectionStatus(sectionId) {
        const section = this.sections.find(s => s.id === sectionId);
        return section ? section.status : null;
    }

    recordAttempt(sectionId, score, totalQuestions) {
        const section = this.sections.find(s => s.id === sectionId);
        if (!section) return null;

        section.attempts += 1;
        if (score > section.bestScore) {
            section.bestScore = score;
        }

        const perfect = score === totalQuestions;
        let unlocked = null;

        if (perfect) {
            section.status = 'completed';
            const nextSection = this.sections.find(s => s.id === sectionId + 1);
            if (nextSection && nextSection.status === 'locked') {
                nextSection.status = 'unlocked';
                unlocked = nextSection.id;
            }
        }

        this.save();
        return { perfect, unlocked };
    }

    unlockSection(sectionId) {
        const section = this.sections.find(s => s.id === sectionId);
        if (section && section.status === 'locked') {
            section.status = 'unlocked';
            this.save();
        }
    }

    getOverallProgress() {
        const total = this.sections.length;
        const completed = this.sections.filter(s => s.status === 'completed').length;
        const percentage = total > 0 ? (completed / total) * 100 : 0;
        
        return { completed, total, percentage };
    }

    getSectionProgress(sectionId) {
        const section = this.sections.find(s => s.id === sectionId);
        if (!section) return null;
        
        return {
            bestScore: section.bestScore,
            attempts: section.attempts,
            status: section.status
        };
    }

    reset() {
        if (this.sections.length > 0) {
            const count = this.sections.length;
            this.sections = [];
            this.initSections(count);
        } else {
            this.sections = [];
            this.save();
        }
    }

    save() {
        localStorage.setItem(`progress_${this.documentId}`, JSON.stringify(this.sections));
    }

    load() {
        const saved = localStorage.getItem(`progress_${this.documentId}`);
        if (saved) {
            try {
                this.sections = JSON.parse(saved);
            } catch (e) {
                this.sections = [];
            }
        } else {
            this.sections = [];
        }
    }

    static generateDocumentId(fileName, textPreview) {
        const str = fileName + textPreview.substring(0, 100);
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
        }
        return `doc_${hash}`;
    }
}

window.ProgressTracker = ProgressTracker;
