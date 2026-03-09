/**
 * Phrase of the day: same phrase all day, cycles through list (no repeat until all shown).
 * Uses an inline list to avoid JSON import at startup, which can cause "runtime not ready" / Non-JS exception in React Native.
 * Full list is kept in phrases.json for reference; you can sync this array from that file if needed.
 */

export interface PhraseEntry {
  phrase: string;
  meaning: string;
  usage: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Inline phrase list (no JSON import at startup to avoid runtime crash). Matches phrases.json content. */
const PHRASES_LIST: PhraseEntry[] = [
  { phrase: "Spill the beans", meaning: "To reveal a secret", usage: "Don't spill the beans about the surprise party!" },
  { phrase: "Bite the bullet", meaning: "To endure a painful or difficult situation", usage: "I hate going to the dentist, but I'll just have to bite the bullet." },
  { phrase: "Piece of cake", meaning: "Something that is very easy to do", usage: "That exam was a piece of cake; I finished it in twenty minutes." },
  { phrase: "Under the weather", meaning: "Feeling slightly unwell or sick", usage: "I'm feeling a bit under the weather, so I'll stay home today." },
  { phrase: "Break the ice", meaning: "To start a conversation in a social setting", usage: "He told a joke to break the ice at the start of the meeting." },
  { phrase: "Call it a day", meaning: "To stop working on something", usage: "We've been at this for ten hours; let's call it a day." },
  { phrase: "Cut to the chase", meaning: "To skip unnecessary details and reach the main point", usage: "I don't have much time, so please just cut to the chase." },
  { phrase: "Hit the nail on the head", meaning: "To describe exactly what is causing a situation", usage: "You hit the nail on the head when you said the project lacked focus." },
  { phrase: "Once in a blue moon", meaning: "Something that happens very rarely", usage: "I only see my old high school friends once in a blue moon." },
  { phrase: "The elephant in the room", meaning: "A major problem that everyone is avoiding", usage: "We need to talk about the budget; it's the elephant in the room." },
  { phrase: "Burn the midnight oil", meaning: "To work late into the night", usage: "She's been burning the midnight oil to finish her thesis." },
  { phrase: "Cold feet", meaning: "To feel nervous before a big event", usage: "He got cold feet just before he was supposed to go on stage." },
  { phrase: "A blessing in disguise", meaning: "A good thing that seemed bad at first", usage: "Losing that job was a blessing in disguise because I found a better one." },
  { phrase: "Back to the drawing board", meaning: "Starting over because a previous attempt failed", usage: "The prototype didn't work, so it's back to the drawing board." },
  { phrase: "Beat around the bush", meaning: "Avoiding the main topic", usage: "Stop beating around the bush and tell me what you really think." },
  { phrase: "Better late than never", meaning: "It's better to arrive late than not at all", usage: "I finally finished the report; better late than never!" },
  { phrase: "Bite off more than you can chew", meaning: "Taking on a task that is too big", usage: "I think I bit off more than I could chew by taking three extra shifts." },
  { phrase: "By the skin of your teeth", meaning: "Narrowly escaping a disaster", usage: "I passed the test by the skin of my teeth." },
  { phrase: "Get out of hand", meaning: "To become difficult to control", usage: "The party got out of hand when fifty uninvited people showed up." },
  { phrase: "Give the benefit of the doubt", meaning: "To believe someone without proof", usage: "He's late again, but let's give him the benefit of the doubt." },
  { phrase: "Go the extra mile", meaning: "To do more than is required", usage: "The hotel staff really went the extra mile to make us comfortable." },
  { phrase: "Hang in there", meaning: "To remain persistent during a difficult time", usage: "I know the training is tough, but hang in there!" },
  { phrase: "In a nutshell", meaning: "To summarize briefly", usage: "In a nutshell, we need more funding to continue the project." },
  { phrase: "Keep your chin up", meaning: "To stay positive in a tough situation", usage: "Keep your chin up; things will get better soon." },
  { phrase: "Miss the boat", meaning: "To be too late for an opportunity", usage: "I waited too long to buy tickets and I missed the boat." },
  { phrase: "No pain, no gain", meaning: "You must work hard to achieve results", usage: "I've been at the gym for two hours; no pain, no gain." },
  { phrase: "On the ball", meaning: "Being alert and efficient", usage: "The new assistant is really on the ball with his scheduling." },
  { phrase: "So far, so good", meaning: "Everything is going well up to this point", usage: "We've finished the first half of the project; so far, so good." },
  { phrase: "Speak of the devil", meaning: "When the person you are talking about appears", usage: "Did you see what Mark did? Oh, speak of the devil, here he is." },
  { phrase: "The best of both worlds", meaning: "An ideal situation with two different benefits", usage: "Working from home gives her the best of both worlds." },
  { phrase: "Through thick and thin", meaning: "To stay together regardless of circumstances", usage: "They have been best friends through thick and thin." },
  { phrase: "Wrap your head around it", meaning: "To understand something complicated", usage: "I'm trying to wrap my head around this new software." },
  { phrase: "Break a leg", meaning: "A way to wish someone good luck", usage: "I know you'll be great in the play tonight; break a leg!" },
  { phrase: "Cost an arm and a leg", meaning: "To be extremely expensive", usage: "The new luxury car cost him an arm and a leg." },
  { phrase: "Every cloud has a silver lining", meaning: "Every bad situation has some good aspect", usage: "I missed the train, but met an old friend; every cloud has a silver lining." },
  { phrase: "Take it with a grain of salt", meaning: "To not take something too seriously", usage: "I take everything he says with a grain of salt." },
  { phrase: "Actions speak louder than words", meaning: "What people do is more important than what they say", usage: "He says he loves me, but actions speak louder than words." },
  { phrase: "All ears", meaning: "Fully listening and paying attention", usage: "Tell me your secret; I'm all ears!" },
  { phrase: "Ball is in your court", meaning: "It is your responsibility to make the next move", usage: "I've sent the proposal; now the ball is in your court." },
  { phrase: "Hit the books", meaning: "To begin studying hard", usage: "I have a big exam tomorrow, so I need to hit the books." },
  { phrase: "Hit the hay", meaning: "To go to bed or go to sleep", usage: "I'm exhausted; it's time to hit the hay." },
  { phrase: "In the nick of time", meaning: "At the last possible moment", usage: "The ambulance arrived in the nick of time." },
  { phrase: "Over the moon", meaning: "Extremely happy or excited", usage: "She's over the moon about her new promotion." },
  { phrase: "Play it by ear", meaning: "To decide what to do as the situation develops", usage: "We don't have a plan; let's just play it by ear." },
  { phrase: "Time flies", meaning: "Time passes very quickly", usage: "Time flies when you're having fun!" },
  { phrase: "Think outside the box", meaning: "To think creatively and unconventionally", usage: "We need to think outside the box to solve this problem." },
  { phrase: "Win-win situation", meaning: "A result that benefits everyone involved", usage: "The partnership was a win-win situation for both companies." },
];

/** Day index since Unix epoch (UTC). Same for entire calendar day. */
function getDayIndex(): number {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor(startOfDay.getTime() / ONE_DAY_MS);
}

/**
 * Returns the phrase of the day. Index = dayIndex % count so no repeat until all are shown.
 */
export function getPhraseOfTheDay(): PhraseEntry {
  const count = PHRASES_LIST.length;
  if (count === 0) {
    return { phrase: "Break the ice", meaning: "To start a conversation", usage: "He told a joke to break the ice." };
  }
  const dayIndex = getDayIndex();
  const index = dayIndex % count;
  return PHRASES_LIST[index];
}
