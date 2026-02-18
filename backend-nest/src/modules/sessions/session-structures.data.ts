export const SESSION_STRUCTURES = {
  job_interview: {
    structure: 'role_play',
    topic: 'Job Interview Practice',
    duration: 10,
    objectives: [
      'Use professional vocabulary',
      'Practice past tense when describing experience',
      'Ask clarifying questions',
    ],
    checkpoints: [
      {
        atTime: 0,
        prompt: 'Partner A: You are the interviewer. Start by asking about their background.',
        type: 'role_switch',
      },
      {
        atTime: 300,
        prompt: 'Switch roles! Partner B is now the interviewer.',
        type: 'role_switch',
      },
      {
        atTime: 540,
        prompt: '1 minute left - wrap up the interview and thank each other!',
        type: 'wrap_up',
      },
    ],
  },

  restaurant_order: {
    structure: 'role_play',
    topic: 'Restaurant Conversation',
    duration: 8,
    objectives: [
      'Practice polite requests ("Could I have...", "May I...")',
      'Ask about menu items',
      'Handle dietary restrictions',
    ],
    checkpoints: [
      {
        atTime: 0,
        prompt: 'Partner A: You are the waiter. Greet the customer and take their order.',
        type: 'role_switch',
      },
      {
        atTime: 240,
        prompt: 'Partner A: The order is wrong! How do you handle the complaint?',
        type: 'topic_change',
      },
      {
        atTime: 360,
        prompt: 'Switch roles! Partner B is now the waiter.',
        type: 'role_switch',
      },
    ],
  },

  travel_stories: {
    structure: 'story_exchange',
    topic: 'Travel Experiences',
    duration: 12,
    objectives: [
      'Use descriptive vocabulary',
      'Practice past tense storytelling',
      'Ask follow-up questions',
    ],
    checkpoints: [
      {
        atTime: 0,
        prompt: 'Partner A: Tell about a memorable trip. Where did you go? What happened?',
        type: 'role_switch',
      },
      {
        atTime: 360,
        prompt: 'Partner B: Now you share a travel story! Partner A, ask questions.',
        type: 'role_switch',
      },
      {
        atTime: 660,
        prompt: 'Final 2 minutes: Discuss - What was the best part of each trip?',
        type: 'topic_change',
      },
    ],
  },

  debate_topic: {
    structure: 'debate',
    topic: 'Friendly Debate',
    duration: 10,
    objectives: [
      'Express opinions clearly',
      'Use "I think...", "In my opinion..."',
      'Disagree politely',
    ],
    checkpoints: [
      {
        atTime: 0,
        prompt: 'Topic: "Is social media good or bad?" Partner A argues FOR, Partner B argues AGAINST.',
        type: 'role_switch',
      },
      {
        atTime: 300,
        prompt: 'Switch positions! Argue the opposite side now.',
        type: 'role_switch',
      },
      {
        atTime: 540,
        prompt: 'Final thoughts - what did you learn from hearing the other side?',
        type: 'wrap_up',
      },
    ],
  },

  quick_icebreaker: {
    structure: 'icebreaker',
    topic: 'Getting to Know You',
    duration: 5,
    objectives: [
      'Introduce yourself',
      'Ask about hobbies and interests',
      'Find something in common',
    ],
    checkpoints: [
      {
        atTime: 0,
        prompt: "Take turns: Share your name, where you're from, and one hobby.",
        type: 'role_switch',
      },
      {
        atTime: 180,
        prompt: 'Last 2 minutes: What do you both have in common?',
        type: 'topic_change',
      },
    ],
  },
};
