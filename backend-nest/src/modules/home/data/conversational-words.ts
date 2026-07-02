import { WordOfTheDay } from '../types/daily-content.types';

/** Spoken-English vocabulary for daily rotation (A2–B1, conversational). */
export const CONVERSATIONAL_WORDS: ReadonlyArray<
  Omit<WordOfTheDay, 'source' | 'listenAudio'>
> = [
  { word: 'awkward', definition: 'Uncomfortable or not smooth in a situation.', example: 'There was an awkward silence after I forgot her name.', partOfSpeech: 'adjective' },
  { word: 'honestly', definition: 'In a truthful or direct way.', example: 'Honestly, I think we should reschedule the call.', partOfSpeech: 'adverb' },
  { word: 'basically', definition: 'In the most important way; essentially.', example: 'Basically, we need one more practice session before Friday.', partOfSpeech: 'adverb' },
  { word: 'actually', definition: 'Used to introduce a real fact or correction.', example: 'I actually prefer morning calls when I am more focused.', partOfSpeech: 'adverb' },
  { word: 'figure out', definition: 'To understand or solve something.', example: 'Let us figure out the best time to meet tomorrow.', partOfSpeech: 'phrasal verb' },
  { word: 'deal with', definition: 'To handle or manage a problem or person.', example: 'I will deal with the client feedback after lunch.', partOfSpeech: 'phrasal verb' },
  { word: 'hang on', definition: 'To wait for a short time.', example: 'Hang on, I am pulling up the document now.', partOfSpeech: 'phrasal verb' },
  { word: 'makes sense', definition: 'To be logical or easy to understand.', example: 'That makes sense — let us try your approach.', partOfSpeech: 'phrase' },
  { word: 'no worries', definition: 'It is fine; do not worry about it.', example: 'No worries if you are five minutes late.', partOfSpeech: 'phrase' },
  { word: 'fair enough', definition: 'Used to accept what someone said.', example: 'Fair enough, we can push the deadline to Monday.', partOfSpeech: 'phrase' },
  { word: 'upfront', definition: 'Direct and honest from the start.', example: 'Let me be upfront about what I can deliver this week.', partOfSpeech: 'adjective' },
  { word: 'overwhelmed', definition: 'Feeling like you have too much to handle.', example: 'I felt overwhelmed with back-to-back meetings today.', partOfSpeech: 'adjective' },
  { word: 'straightforward', definition: 'Easy to understand; not complicated.', example: 'The instructions were straightforward and easy to follow.', partOfSpeech: 'adjective' },
  { word: 'reliable', definition: 'Someone or something you can depend on.', example: 'She is reliable — she always joins on time.', partOfSpeech: 'adjective' },
  { word: 'flexible', definition: 'Willing to change plans when needed.', example: 'I am flexible if you want to move the call earlier.', partOfSpeech: 'adjective' },
  { word: 'patient', definition: 'Able to stay calm when things take time.', example: 'Thanks for being patient while I share my screen.', partOfSpeech: 'adjective' },
  { word: 'confident', definition: 'Sure of yourself and your abilities.', example: 'I sound more confident when I prepare key phrases.', partOfSpeech: 'adjective' },
  { word: 'nervous', definition: 'Worried or uneasy about something.', example: 'I get nervous before speaking in large meetings.', partOfSpeech: 'adjective' },
  { word: 'polite', definition: 'Showing good manners and respect.', example: 'It is polite to thank your partner after a practice call.', partOfSpeech: 'adjective' },
  { word: 'casual', definition: 'Relaxed and informal.', example: 'We kept the conversation casual before starting the task.', partOfSpeech: 'adjective' },
  { word: 'clarify', definition: 'To make something clearer or easier to understand.', example: 'Could you clarify what you mean by "short update"?', partOfSpeech: 'verb' },
  { word: 'confirm', definition: 'To check that something is correct or agreed.', example: 'Can you confirm the meeting time in the chat?', partOfSpeech: 'verb' },
  { word: 'postpone', definition: 'To move an event to a later time.', example: 'We had to postpone the review until next week.', partOfSpeech: 'verb' },
  { word: 'remind', definition: 'To help someone remember something.', example: 'Remind me to send the notes after the call.', partOfSpeech: 'verb' },
  { word: 'apologize', definition: 'To say you are sorry for something.', example: 'I apologize for joining a few minutes late.', partOfSpeech: 'verb' },
  { word: 'appreciate', definition: 'To be thankful for something someone did.', example: 'I appreciate your feedback on my pronunciation.', partOfSpeech: 'verb' },
  { word: 'suggest', definition: 'To offer an idea for others to consider.', example: 'I suggest we practice introductions first.', partOfSpeech: 'verb' },
  { word: 'improve', definition: 'To make something better than before.', example: 'Daily practice helped me improve my fluency.', partOfSpeech: 'verb' },
  { word: 'struggle', definition: 'To have difficulty doing something.', example: 'I still struggle with fast native speakers.', partOfSpeech: 'verb' },
  { word: 'handle', definition: 'To manage or deal with a task or situation.', example: 'She can handle tough questions calmly.', partOfSpeech: 'verb' },
  { word: 'deadline', definition: 'The latest time something must be finished.', example: 'Our deadline is Thursday, so let us plan today.', partOfSpeech: 'noun' },
  { word: 'feedback', definition: 'Comments about how well you did something.', example: 'Constructive feedback helps me fix small mistakes.', partOfSpeech: 'noun' },
  { word: 'update', definition: 'New information about how something is going.', example: 'I will send a quick update after the client call.', partOfSpeech: 'noun' },
  { word: 'schedule', definition: 'A plan of times for meetings or tasks.', example: 'My schedule is tight, but I have a slot at four.', partOfSpeech: 'noun' },
  { word: 'priority', definition: 'Something important that should come first.', example: 'Pronunciation is my top priority this month.', partOfSpeech: 'noun' },
  { word: 'misunderstanding', definition: 'A failure to understand each other correctly.', example: 'It was a misunderstanding — we meant the same thing.', partOfSpeech: 'noun' },
  { word: 'progress', definition: 'Movement toward a better result over time.', example: 'I can see real progress in my speaking confidence.', partOfSpeech: 'noun' },
  { word: 'habit', definition: 'Something you do regularly, often without thinking.', example: 'Building a daily speaking habit changed my fluency.', partOfSpeech: 'noun' },
  { word: 'tone', definition: 'The way your voice sounds — friendly, serious, etc.', example: 'Your tone sounded friendly even when you disagreed.', partOfSpeech: 'noun' },
  { word: 'pause', definition: 'A short stop before continuing to speak.', example: 'A short pause helps you collect your thoughts.', partOfSpeech: 'noun' },
  { word: 'roughly', definition: 'Approximately; not exactly.', example: 'The meeting will take roughly thirty minutes.', partOfSpeech: 'adverb' },
  { word: 'eventually', definition: 'At some later time; in the end.', example: 'Eventually, complex grammar started to feel natural.', partOfSpeech: 'adverb' },
  { word: 'slightly', definition: 'A little; not very much.', example: 'I was slightly nervous at the start of the call.', partOfSpeech: 'adverb' },
  { word: 'definitely', definition: 'Without doubt; for sure.', example: 'I would definitely join another practice session.', partOfSpeech: 'adverb' },
  { word: 'probably', definition: 'Likely to happen or be true.', example: 'We will probably finish early if we stay focused.', partOfSpeech: 'adverb' },
  { word: 'meanwhile', definition: 'While something else is happening.', example: 'Meanwhile, I will prepare the talking points.', partOfSpeech: 'adverb' },
  { word: 'otherwise', definition: 'If not; in a different situation.', example: 'Send it today, otherwise we miss the deadline.', partOfSpeech: 'adverb' },
  { word: 'instead', definition: 'In place of something else.', example: 'Let us use examples instead of long definitions.', partOfSpeech: 'adverb' },
  { word: 'anyway', definition: 'Used to continue or return to the main point.', example: 'Anyway, let us get back to today\'s topic.', partOfSpeech: 'adverb' },
  { word: 'stuck', definition: 'Unable to move forward or decide.', example: 'I got stuck trying to explain my idea clearly.', partOfSpeech: 'adjective' },
  { word: 'relevant', definition: 'Closely connected to what is being discussed.', example: 'That example is relevant to our conversation.', partOfSpeech: 'adjective' },
  { word: 'specific', definition: 'Clear and exact, not general.', example: 'Can you give a specific example from work?', partOfSpeech: 'adjective' },
  { word: 'useful', definition: 'Helpful for a particular purpose.', example: 'Recording myself was useful for spotting filler words.', partOfSpeech: 'adjective' },
  { word: 'common', definition: 'Happening or used often.', example: 'It is common to feel shy on your first partner call.', partOfSpeech: 'adjective' },
  { word: 'brief', definition: 'Short in time or length.', example: 'Keep your intro brief — thirty seconds is enough.', partOfSpeech: 'adjective' },
  { word: 'available', definition: 'Free to talk or meet at a given time.', example: 'Are you available for a quick practice tomorrow?', partOfSpeech: 'adjective' },
  { word: 'check in', definition: 'To contact someone to see how things are going.', example: 'Let us check in after you try the new exercise.', partOfSpeech: 'phrasal verb' },
  { word: 'follow up', definition: 'To contact someone again about an earlier topic.', example: 'I will follow up with an email summary.', partOfSpeech: 'phrasal verb' },
  { word: 'wrap up', definition: 'To finish or bring something to an end.', example: 'Let us wrap up with one key takeaway.', partOfSpeech: 'phrasal verb' },
  { word: 'run late', definition: 'To arrive or finish later than planned.', example: 'Sorry, I might run late because of traffic.', partOfSpeech: 'phrase' },
  { word: 'on the same page', definition: 'Sharing the same understanding as others.', example: 'Let us make sure we are on the same page before we start.', partOfSpeech: 'phrase' },
];

export function getConversationalWordForDay(date: Date): WordOfTheDay {
  const seed = Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      (24 * 60 * 60 * 1000),
  );
  const entry = CONVERSATIONAL_WORDS[Math.abs(seed) % CONVERSATIONAL_WORDS.length];
  return { ...entry, source: 'curated' };
}
