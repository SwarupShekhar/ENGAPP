import { Injectable, Logger } from '@nestjs/common';

export type UserLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface Question {
    id: string;
    text: string;
    level: UserLevel;
    focus: 'general' | 'business' | 'casual' | 'academic';
    type: 'read_aloud' | 'image_description' | 'open_response';
    imageUrl?: string;
}

@Injectable()
export class AdaptiveQuestionSelector {
    private readonly logger = new Logger(AdaptiveQuestionSelector.name);

    private readonly QUESTIONS: Question[] = [
        // A1
        { id: 'a1_1', text: "I like to eat apples.", level: 'A1', focus: 'general', type: 'read_aloud' },
        { id: 'a1_2', text: "My name is John.", level: 'A1', focus: 'general', type: 'read_aloud' },

        // A2
        { id: 'a2_1', text: "I often go to the park on weekends.", level: 'A2', focus: 'general', type: 'read_aloud' },
        { id: 'a2_img_1', text: "Describe this kitchen.", level: 'A2', focus: 'general', type: 'image_description', imageUrl: 'https://res.cloudinary.com/de8vvmpip/image/upload/v1770879569/kitchen_pqrrxf.png' },

        // B1
        { id: 'b1_1', text: "Although I was tired, I finished my work before going to bed.", level: 'B1', focus: 'general', type: 'read_aloud' },
        { id: 'b1_img_1', text: "Describe this busy park.", level: 'B1', focus: 'general', type: 'image_description', imageUrl: 'https://res.cloudinary.com/de8vvmpip/image/upload/v1770879569/Busypark_rx3ebg.png' },

        // B2
        { id: 'b2_1', text: "The economy has been improving steadily over the last decade.", level: 'B2', focus: 'business', type: 'read_aloud' },
        { id: 'b2_img_1', text: "Describe this meeting.", level: 'B2', focus: 'business', type: 'image_description', imageUrl: 'https://res.cloudinary.com/de8vvmpip/image/upload/v1770879569/Office_meeting_kgdysg.png' },

        // C1
        { id: 'c1_1', text: "The unprecedented technological advancements have fundamentally transformed our daily communication patterns.", level: 'C1', focus: 'academic', type: 'read_aloud' },

        // C2
        { id: 'c2_1', text: "Albeit controversial, the decision to implement austere fiscal policies was deemed necessary to curb inflation.", level: 'C2', focus: 'academic', type: 'read_aloud' }
    ];

    selectNextQuestion(
        currentLevel: UserLevel,
        previousPerformance: { accuracy: number; fluency: number },
        phase: 'phase2' | 'phase3' | 'phase4'
    ): Question {
        this.logger.log(`Selecting question for level ${currentLevel}, performance: ${JSON.stringify(previousPerformance)}, phase: ${phase}`);

        let targetLevel = currentLevel;
        const avgScore = (previousPerformance.accuracy + previousPerformance.fluency) / 2;

        // Adaptive Logic
        if (avgScore > 85) {
            targetLevel = this.levelUp(currentLevel);
        } else if (avgScore < 60) {
            targetLevel = this.levelDown(currentLevel);
        }

        // Filter valid questions
        const typeMap = {
            'phase2': 'read_aloud',
            'phase3': 'image_description',
            'phase4': 'open_response' // We don't have many of these yet in bank, usually generated
        };

        const candidates = this.QUESTIONS.filter(q =>
            q.level === targetLevel &&
            q.type === typeMap[phase]
        );

        // Fallback if no specific level found (e.g., C2 image description)
        if (candidates.length === 0) {
            // Try fallback level
            const fallbackCandidates = this.QUESTIONS.filter(q =>
                q.type === typeMap[phase]
            );
            return fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)];
        }

        // Randomly select one
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    private levelUp(level: UserLevel): UserLevel {
        const levels: UserLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        const idx = levels.indexOf(level);
        return idx < levels.length - 1 ? levels[idx + 1] : level;
    }

    private levelDown(level: UserLevel): UserLevel {
        const levels: UserLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        const idx = levels.indexOf(level);
        return idx > 0 ? levels[idx - 1] : level;
    }
}
