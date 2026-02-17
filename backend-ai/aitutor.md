A conversational AI tutor that corrects in real-time while maintaining flow is exactly what language learners need. Let me design the complete system for you.

---

## **System Architecture**

```
User speaks (Hinglish) 
    ↓
Azure Speech STT (recognizes Hindi + English mixed speech)
    ↓
Gemini AI (processes, detects errors, generates empathetic response)
    ↓
Google TTS (speaks back in Hinglish with corrections)
    ↓
Conversation continues...
    ↓
End Session → Detailed Feedback Report
```

---

## **1. Real-Time Conversational Flow Design**

### **The Golden Rule: Don't Break Immersion**

**Bad approach:**
```
User: "I dranking water"
AI: "ERROR: Incorrect grammar. Correct form is 'I am drinking water'. Score: -5 points."
```
❌ This feels like a test, not a conversation.

**Good approach:**
```
User: "I dranking water"
AI: "Oh, पानी पी रहे हो? That's good! By the way, in English we say 'I am drinking water' - can you try saying that?"
User: "I am drinking water"
AI: "Perfect! बिल्कुल सही! So, what else did you do today?"
```
✅ Natural, encouraging, maintains conversation flow.

---

## **2. Gemini Prompt Engineering for Conversational Tutor**

### **System Prompt Template**

```javascript
// In backend-nest or backend-ai

const CONVERSATIONAL_TUTOR_PROMPT = `
You are Priya, a friendly English tutor who speaks Hinglish (Hindi + English mix).

YOUR PERSONALITY:
- Warm, encouraging, patient like a supportive older sister
- You code-switch naturally between Hindi and English
- You celebrate small wins enthusiastically
- You correct errors gently without making the learner feel bad

YOUR TEACHING STYLE:
1. Listen to what the user says
2. If there's an error:
   - Acknowledge what they said (show you understood)
   - Gently correct using the sandwich method: compliment → correction → encouragement
   - Ask them to repeat the correct form
3. If correct:
   - Celebrate briefly
   - Continue the conversation naturally
4. Keep the conversation flowing - don't lecture

ERROR CORRECTION FRAMEWORK:
When you detect an error, respond in this format:
{
  "understood": "I understand you meant: [paraphrase in correct English]",
  "correction": {
    "wrong": "exact phrase they said",
    "right": "correct version",
    "explanation_hinglish": "brief reason in Hinglish (max 10 words)",
    "severity": "major|minor"
  },
  "response": "your conversational response mixing Hindi/English",
  "follow_up": "a question or prompt to continue conversation"
}

EXAMPLE INTERACTION:
User: "Yesterday I go to market"
Your response: {
  "understood": "You went to the market yesterday",
  "correction": {
    "wrong": "I go to market",
    "right": "I went to the market",
    "explanation_hinglish": "Yesterday = past tense, so 'went' not 'go'",
    "severity": "major"
  },
  "response": "Achha, market गए थे कल! By the way, in English we say 'I went to the market' क्योंकि 'yesterday' means it already happened. Can you try saying 'I went to the market'?",
  "follow_up": "Market में क्या खरीदा?"
}

CONVERSATION RULES:
- Max 2-3 sentences per response (don't overwhelm)
- Use Hindi words for emphasis, empathy, and common expressions
- If they make the same mistake 3+ times, try a different explanation
- If they're frustrated, switch to more Hindi to comfort them
- Always end with a question or prompt to keep them talking
- Track their energy level - if they sound tired, suggest a break

TOPICS TO DISCUSS:
- Daily routines (relatable, uses common verbs)
- Hobbies and interests (motivating)
- Food and cooking (rich vocabulary)
- Technology and social media (relevant to their life)
- Travel and places (storytelling practice)

DO NOT:
- Give long grammar lectures
- Use technical terms (don't say "present perfect continuous")
- Correct every tiny mistake (prioritize major errors)
- Sound robotic or like a textbook
- Make them feel stupid

Current conversation context:
{conversation_history}

User's profile:
- Native language: Hindi
- Current level: {user_level}
- Persistent issues: {common_mistakes}
- Interests: {user_hobbies}

User just said: "{user_utterance}"

Respond naturally as Priya.
`;
```

---

## **3. Backend Implementation**

### **New Service: `conversational-tutor.service.ts`**

```typescript
// backend-nest/src/modules/conversational-tutor/conversational-tutor.service.ts

import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ConversationTurn {
  speaker: 'user' | 'ai';
  text: string;
  timestamp: Date;
  corrections?: ErrorCorrection[];
}

interface ErrorCorrection {
  wrong: string;
  right: string;
  explanation_hinglish: string;
  severity: 'major' | 'minor';
  timestamp: Date;
}

@Injectable()
export class ConversationalTutorService {
  private genAI: GoogleGenerativeAI;
  private conversations: Map<string, ConversationTurn[]> = new Map();
  
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  
  async processUserUtterance(
    sessionId: string,
    userUtterance: string,
    userProfile: any
  ) {
    // Get conversation history
    const history = this.conversations.get(sessionId) || [];
    
    // Build context-aware prompt
    const prompt = this.buildPrompt(userUtterance, history, userProfile);
    
    // Call Gemini
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9, // High creativity for natural conversation
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 200, // Keep responses short
        responseMimeType: 'application/json', // Force JSON output
      },
    });
    
    const response = JSON.parse(result.response.text());
    
    // Store in conversation history
    history.push({
      speaker: 'user',
      text: userUtterance,
      timestamp: new Date(),
      corrections: response.correction ? [response.correction] : []
    });
    
    history.push({
      speaker: 'ai',
      text: response.response,
      timestamp: new Date()
    });
    
    this.conversations.set(sessionId, history);
    
    return {
      aiResponse: response.response,
      correction: response.correction,
      followUp: response.follow_up,
      conversationHistory: history
    };
  }
  
  buildPrompt(userUtterance: string, history: ConversationTurn[], userProfile: any) {
    // Format conversation history
    const conversationContext = history
      .slice(-10) // Last 10 turns only
      .map(turn => `${turn.speaker === 'user' ? 'User' : 'Priya'}: ${turn.text}`)
      .join('\n');
    
    // Extract common mistakes from history
    const commonMistakes = this.analyzeCommonMistakes(history);
    
    return CONVERSATIONAL_TUTOR_PROMPT
      .replace('{conversation_history}', conversationContext)
      .replace('{user_level}', userProfile.level || 'B1')
      .replace('{common_mistakes}', JSON.stringify(commonMistakes))
      .replace('{user_hobbies}', userProfile.hobbies?.join(', ') || 'technology, coding')
      .replace('{user_utterance}', userUtterance);
  }
  
  analyzeCommonMistakes(history: ConversationTurn[]): string[] {
    const mistakes = history
      .filter(turn => turn.corrections && turn.corrections.length > 0)
      .flatMap(turn => turn.corrections);
    
    // Count error types
    const errorTypes: Record<string, number> = {};
    mistakes.forEach(mistake => {
      const type = this.categorizeError(mistake.wrong, mistake.right);
      errorTypes[type] = (errorTypes[type] || 0) + 1;
    });
    
    // Return top 3 most common
    return Object.entries(errorTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type);
  }
  
  categorizeError(wrong: string, right: string): string {
    // Simple heuristics - can be improved
    if (wrong.includes('go') && right.includes('went')) return 'past_tense';
    if (wrong.includes('is') && right.includes('are')) return 'subject_verb_agreement';
    if (!wrong.includes('the') && right.includes('the')) return 'articles';
    // Add more patterns...
    return 'general_grammar';
  }
  
  async endSessionAndGenerateFeedback(sessionId: string) {
    const history = this.conversations.get(sessionId) || [];
    
    // Generate comprehensive feedback report
    const feedback = {
      sessionDuration: this.calculateDuration(history),
      totalTurns: history.length,
      userTurns: history.filter(t => t.speaker === 'user').length,
      
      mistakes: {
        total: history.filter(t => t.corrections?.length).length,
        major: history.filter(t => t.corrections?.some(c => c.severity === 'major')).length,
        minor: history.filter(t => t.corrections?.some(c => c.severity === 'minor')).length,
        breakdown: this.groupMistakesByType(history)
      },
      
      improvement: {
        repeatedCorrectly: this.trackCorrectionSuccess(history),
        persistentIssues: this.analyzeCommonMistakes(history)
      },
      
      conversationQuality: {
        topicsCovered: this.extractTopics(history),
        engagementLevel: this.estimateEngagement(history),
        vocabulary: this.analyzeVocabulary(history)
      },
      
      transcript: history,
      
      nextSteps: this.generateNextSteps(history)
    };
    
    // Clean up session
    this.conversations.delete(sessionId);
    
    return feedback;
  }
  
  groupMistakesByType(history: ConversationTurn[]) {
    const grouped: Record<string, ErrorCorrection[]> = {};
    
    history.forEach(turn => {
      turn.corrections?.forEach(correction => {
        const type = this.categorizeError(correction.wrong, correction.right);
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push(correction);
      });
    });
    
    return grouped;
  }
  
  trackCorrectionSuccess(history: ConversationTurn[]) {
    // Check if user successfully repeated corrections
    const successes = [];
    
    for (let i = 0; i < history.length - 1; i++) {
      const turn = history[i];
      if (turn.corrections && turn.corrections.length > 0) {
        // Check if next user turn contains the correct form
        const nextUserTurn = history.slice(i + 1).find(t => t.speaker === 'user');
        if (nextUserTurn) {
          turn.corrections.forEach(correction => {
            if (nextUserTurn.text.toLowerCase().includes(correction.right.toLowerCase())) {
              successes.push({
                correction: correction,
                succeededAt: nextUserTurn.timestamp
              });
            }
          });
        }
      }
    }
    
    return successes;
  }
  
  extractTopics(history: ConversationTurn[]): string[] {
    // Simple keyword-based topic extraction
    const topicKeywords = {
      work: ['job', 'office', 'work', 'boss', 'colleague', 'meeting'],
      food: ['eat', 'food', 'cook', 'restaurant', 'meal', 'breakfast', 'lunch', 'dinner'],
      hobbies: ['hobby', 'like', 'enjoy', 'play', 'watch', 'read'],
      travel: ['travel', 'trip', 'visit', 'place', 'city', 'country'],
      technology: ['computer', 'phone', 'app', 'website', 'code', 'programming']
    };
    
    const detectedTopics = new Set<string>();
    const fullText = history.map(t => t.text).join(' ').toLowerCase();
    
    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      if (keywords.some(kw => fullText.includes(kw))) {
        detectedTopics.add(topic);
      }
    });
    
    return Array.from(detectedTopics);
  }
  
  estimateEngagement(history: ConversationTurn[]): number {
    // Heuristic: longer user turns = more engaged
    const userTurns = history.filter(t => t.speaker === 'user');
    const avgLength = userTurns.reduce((sum, t) => sum + t.text.split(' ').length, 0) / userTurns.length;
    
    // Simple scoring
    if (avgLength > 15) return 90; // Highly engaged
    if (avgLength > 10) return 75;
    if (avgLength > 5) return 60;
    return 40; // Short responses = low engagement
  }
  
  analyzeVocabulary(history: ConversationTurn[]) {
    const userText = history
      .filter(t => t.speaker === 'user')
      .map(t => t.text)
      .join(' ');
    
    const words = userText.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    
    return {
      totalWords: words.length,
      uniqueWords: uniqueWords.size,
      lexicalDiversity: (uniqueWords.size / words.length * 100).toFixed(1) + '%'
    };
  }
  
  generateNextSteps(history: ConversationTurn[]): string[] {
    const commonMistakes = this.analyzeCommonMistakes(history);
    const steps = [];
    
    if (commonMistakes.includes('past_tense')) {
      steps.push('Practice past tense forms with regular and irregular verbs');
    }
    if (commonMistakes.includes('articles')) {
      steps.push('Study article usage (a, an, the) with specific vs general nouns');
    }
    if (commonMistakes.includes('subject_verb_agreement')) {
      steps.push('Review subject-verb agreement, especially with third person singular');
    }
    
    // Generic recommendations
    steps.push('Have 2-3 more tutor conversations this week');
    steps.push('Try explaining a complex topic (like how to cook a dish) to practice');
    
    return steps;
  }
  
  calculateDuration(history: ConversationTurn[]): number {
    if (history.length < 2) return 0;
    
    const start = history[0].timestamp;
    const end = history[history.length - 1].timestamp;
    
    return Math.floor((end.getTime() - start.getTime()) / 1000 / 60); // minutes
  }
}
```

---

## **4. Azure Speech STT Configuration for Hinglish**

### **Critical: Enable Language Identification**

```typescript
// backend-ai/app/services/hinglish_tutor_service.py

import azure.cognitiveservices.speech as speechsdk

class HinglishSTTService:
    def __init__(self):
        self.speech_config = speechsdk.SpeechConfig(
            subscription=os.getenv('AZURE_SPEECH_KEY'),
            region=os.getenv('AZURE_SPEECH_REGION')
        )
        
        # CRITICAL: Enable continuous language identification
        auto_detect_source_language_config = speechsdk.languageconfig.AutoDetectSourceLanguageConfig(
            languages=["en-IN", "hi-IN"]  # Indian English + Hindi
        )
        
        self.auto_detect_config = auto_detect_source_language_config
    
    def recognize_hinglish_streaming(self, audio_stream):
        """
        Real-time recognition with automatic language switching
        """
        
        audio_config = speechsdk.audio.AudioConfig(stream=audio_stream)
        
        # Create recognizer with multi-language support
        speech_recognizer = speechsdk.SpeechRecognizer(
            speech_config=self.speech_config,
            auto_detect_source_language_config=self.auto_detect_config,
            audio_config=audio_config
        )
        
        recognized_text = []
        
        def recognized_callback(evt):
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                # Detect which language was used
                detected_language = evt.result.properties.get(
                    speechsdk.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult
                )
                
                recognized_text.append({
                    'text': evt.result.text,
                    'language': detected_language,
                    'confidence': evt.result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
                })
        
        speech_recognizer.recognized.connect(recognized_callback)
        
        # Start continuous recognition
        speech_recognizer.start_continuous_recognition()
        
        return recognized_text
```

---

## **5. Google TTS for Hinglish Output**

### **The Challenge: Making TTS Sound Natural in Hinglish**

```python
# backend-ai/app/services/hinglish_tts_service.py

from google.cloud import texttospeech
import re

class HinglishTTSService:
    def __init__(self):
        self.client = texttospeech.TextToSpeechClient()
    
    def synthesize_hinglish(self, text: str, gender: str = 'female'):
        """
        Convert Hinglish text to speech
        
        Challenge: Google TTS can't handle mixed language in single request
        Solution: Split text into language chunks and synthesize separately
        """
        
        # Split text into Hindi and English segments
        segments = self.split_hinglish_text(text)
        
        audio_segments = []
        
        for segment in segments:
            if segment['language'] == 'hindi':
                voice = texttospeech.VoiceSelectionParams(
                    language_code='hi-IN',
                    name='hi-IN-Wavenet-A' if gender == 'female' else 'hi-IN-Wavenet-B',
                    ssml_gender=texttospeech.SsmlVoiceGender.FEMALE if gender == 'female' else texttospeech.SsmlVoiceGender.MALE
                )
            else:  # English
                voice = texttospeech.VoiceSelectionParams(
                    language_code='en-IN',  # Indian English accent
                    name='en-IN-Wavenet-D' if gender == 'female' else 'en-IN-Wavenet-B',
                    ssml_gender=texttospeech.SsmlVoiceGender.FEMALE if gender == 'female' else texttospeech.SsmlVoiceGender.MALE
                )
            
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3,
                speaking_rate=0.95,  # Slightly slower for clarity
                pitch=0.0
            )
            
            synthesis_input = texttospeech.SynthesisInput(text=segment['text'])
            
            response = self.client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config
            )
            
            audio_segments.append(response.audio_content)
        
        # Concatenate audio segments
        return self.concatenate_audio(audio_segments)
    
    def split_hinglish_text(self, text: str) -> list:
        """
        Split Hinglish text into language-specific segments
        
        Example: "Achha, market गए थे कल! By the way, market में क्या खरीदा?"
        
        Becomes:
        [
          {'language': 'english', 'text': 'Achha, market'},
          {'language': 'hindi', 'text': 'गए थे कल!'},
          {'language': 'english', 'text': 'By the way, market'},
          {'language': 'hindi', 'text': 'में क्या खरीदा?'}
        ]
        """
        
        # Regex to detect Devanagari script (Hindi)
        hindi_pattern = re.compile(r'[\u0900-\u097F]+')
        
        segments = []
        current_segment = {'text': '', 'language': 'english'}
        
        words = text.split()
        
        for word in words:
            if hindi_pattern.search(word):
                # Hindi word detected
                if current_segment['language'] == 'english' and current_segment['text']:
                    # Save previous English segment
                    segments.append(current_segment)
                    current_segment = {'text': '', 'language': 'hindi'}
                
                current_segment['text'] += ' ' + word
                current_segment['language'] = 'hindi'
            else:
                # English word
                if current_segment['language'] == 'hindi' and current_segment['text']:
                    # Save previous Hindi segment
                    segments.append(current_segment)
                    current_segment = {'text': '', 'language': 'english'}
                
                current_segment['text'] += ' ' + word
                current_segment['language'] = 'english'
        
        # Add last segment
        if current_segment['text']:
            segments.append(current_segment)
        
        return segments
    
    def concatenate_audio(self, audio_segments: list) -> bytes:
        """
        Merge multiple audio clips into one
        """
        from pydub import AudioSegment
        import io
        
        combined = AudioSegment.empty()
        
        for audio_data in audio_segments:
            segment = AudioSegment.from_file(io.BytesIO(audio_data), format='mp3')
            combined += segment
        
        # Export as bytes
        output = io.BytesIO()
        combined.export(output, format='mp3')
        return output.getvalue()
```

---

## **6. API Endpoints**

```typescript
// backend-nest/src/modules/conversational-tutor/conversational-tutor.controller.ts

@Controller('conversational-tutor')
export class ConversationalTutorController {
  constructor(private tutorService: ConversationalTutorService) {}
  
  @Post('start-session')
  async startSession(@Body() dto: { userId: string }) {
    const sessionId = uuidv4();
    
    // Initialize with greeting
    const greeting = await this.tutorService.processUserUtterance(
      sessionId,
      "START_SESSION",  // Special trigger
      await this.getUserProfile(dto.userId)
    );
    
    return {
      sessionId,
      greeting: greeting.aiResponse
    };
  }
  
  @Post('process-speech')
  @UseInterceptors(FileInterceptor('audio'))
  async processSpeech(
    @UploadedFile() audio: Express.Multer.File,
    @Body('sessionId') sessionId: string,
    @Body('userId') userId: string
  ) {
    // 1. Transcribe audio with Azure STT (call Python service)
    const transcription = await this.azureService.transcribeHinglish(audio.buffer);
    
    // 2. Process with Gemini
    const userProfile = await this.getUserProfile(userId);
    const response = await this.tutorService.processUserUtterance(
      sessionId,
      transcription.text,
      userProfile
    );
    
    // 3. Convert response to speech with Google TTS (call Python service)
    const audioResponse = await this.ttsService.synthesizeHinglish(
      response.aiResponse,
      userProfile.preferredVoiceGender || 'female'
    );
    
    return {
      transcription: transcription.text,
      aiResponse: response.aiResponse,
      aiAudioUrl: audioResponse.url,
      correction: response.correction,
      conversationHistory: response.conversationHistory
    };
  }
  
  @Post('end-session')
  async endSession(@Body('sessionId') sessionId: string) {
    const feedback = await this.tutorService.endSessionAndGenerateFeedback(sessionId);
    
    // Save to database
    await this.prisma.tutorSession.create({
      data: {
        sessionId,
        feedbackData: feedback,
        createdAt: new Date()
      }
    });
    
    return feedback;
  }
}
```

---

## **7. Frontend Mobile Implementation**

### **Real-Time Conversation Screen**

```typescript
// mobile-app/src/screens/ConversationalTutorScreen.tsx

import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import LottieView from 'lottie-react-native';

export const ConversationalTutorScreen = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTutorSpeaking, setIsTutorSpeaking] = useState(false);
  const [conversation, setConversation] = useState<any[]>([]);
  const [currentCorrection, setCurrentCorrection] = useState<any>(null);
  
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  
  const startSession = async () => {
    const response = await api.post('/conversational-tutor/start-session', {
      userId: currentUser.id
    });
    
    setSessionId(response.data.sessionId);
    
    // Play AI greeting
    await playAIResponse(response.data.greeting);
  };
  
  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };
  
  const stopRecording = async () => {
    if (!recordingRef.current) return;
    
    setIsRecording(false);
    await recordingRef.current.stopAndUnloadAsync();
    
    const uri = recordingRef.current.getURI();
    
    // Send to backend
    const formData = new FormData();
    formData.append('audio', {
      uri,
      type: 'audio/m4a',
      name: 'recording.m4a',
    } as any);
    formData.append('sessionId', sessionId);
    formData.append('userId', currentUser.id);
    
    const response = await api.post('/conversational-tutor/process-speech', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    
    // Update conversation
    setConversation(prev => [
      ...prev,
      {
        speaker: 'user',
        text: response.data.transcription,
        timestamp: new Date()
      },
      {
        speaker: 'ai',
        text: response.data.aiResponse,
        timestamp: new Date(),
        correction: response.data.correction
      }
    ]);
    
    // Show correction if present
    if (response.data.correction) {
      setCurrentCorrection(response.data.correction);
    }
    
    // Play AI response
    await playAIResponse(response.data.aiAudioUrl);
    
    recordingRef.current = null;
  };
  
  const playAIResponse = async (audioUrl: string) => {
    setIsTutorSpeaking(true);
    
    const { sound } = await Audio.Sound.createAsync({ uri: audioUrl });
    soundRef.current = sound;
    
    await sound.playAsync();
    
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        setIsTutorSpeaking(false);
      }
    });
  };
  
  const endSession = async () => {
    const feedback = await api.post('/conversational-tutor/end-session', {
      sessionId
    });
    
    // Navigate to feedback screen
    navigation.navigate('TutorFeedback', { feedback: feedback.data });
  };
  
  return (
    <View style={styles.container}>
      {/* AI Avatar Animation */}
      <View style={styles.avatarContainer}>
        <LottieView
          source={require('../assets/priya-avatar.json')}
          autoPlay={isTutorSpeaking}
          loop={isTutorSpeaking}
          style={styles.avatar}
        />
        <Text style={styles.tutorName}>Priya</Text>
      </View>
      
      {/* Conversation Display */}
      <ScrollView style={styles.conversation}>
        {conversation.map((turn, index) => (
          <View
            key={index}
            style={[
              styles.bubble,
              turn.speaker === 'user' ? styles.userBubble : styles.aiBubble
            ]}
          >
            <Text style={styles.bubbleText}>{turn.text}</Text>
            
            {turn.correction && (
              <View style={styles.correctionBox}>
                <Text style={styles.correctionLabel}>Correction:</Text>
                <Text style={styles.wrongText}>❌ {turn.correction.wrong}</Text>
                <Text style={styles.rightText}>✓ {turn.correction.right}</Text>
                <Text style={styles.explanationText}>
                  💡 {turn.correction.explanation_hinglish}
                </Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
      
      {/* Current Correction Highlight (if any) */}
      {currentCorrection && (
        <View style={styles.correctionPrompt}>
          <Text style={styles.promptText}>
            Can you say: "{currentCorrection.right}"?
          </Text>
          <TouchableOpacity
            style={styles.tryAgainButton}
            onPress={() => {
              setCurrentCorrection(null);
              startRecording();
            }}
          >
            <Text style={styles.tryAgainText}>🎤 Try Again</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* Record Button */}
      <TouchableOpacity
        style={[
          styles.recordButton,
          isRecording && styles.recordingActive
        ]}
        onPressIn={startRecording}
        onPressOut={stopRecording}
        disabled={isTutorSpeaking}
      >
        <Text style={styles.recordButtonText}>
          {isRecording ? '🔴 Recording...' : '🎤 Hold to Speak'}
        </Text>
      </TouchableOpacity>
      
      {/* End Session Button */}
      <TouchableOpacity style={styles.endButton} onPress={endSession}>
        <Text style={styles.endButtonText}>End & See Feedback</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1e',
    padding: 20,
  },
  avatarContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  avatar: {
    width: 150,
    height: 150,
  },
  tutorName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginTop: 10,
  },
  conversation: {
    flex: 1,
    marginBottom: 20,
  },
  bubble: {
    padding: 12,
    borderRadius: 16,
    marginVertical: 6,
    maxWidth: '80%',
  },
  userBubble: {
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
    alignSelf: 'flex-end',
  },
  aiBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignSelf: 'flex-start',
  },
  bubbleText: {
    color: '#fff',
    fontSize: 16,
  },
  correctionBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  correctionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f59e0b',
    marginBottom: 4,
  },
  wrongText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textDecorationLine: 'line-through',
  },
  rightText: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
  },
  explanationText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
    fontStyle: 'italic',
  },
  correctionPrompt: {
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  promptText: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 8,
  },
  tryAgainButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tryAgainText: {
    color: '#fff',
    fontWeight: '600',
  },
  recordButton: {
    backgroundColor: '#8b5cf6',
    padding: 20,
    borderRadius: 50,
    alignItems: 'center',
    marginBottom: 12,
  },
  recordingActive: {
    backgroundColor: '#ef4444',
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  endButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  endButtonText: {
    color: '#fff',
    fontSize: 14,
  },
});
```

---

## **8. Key Considerations & Edge Cases**

### **Google TTS Quota Management**

```typescript
// Shared TTS service can cause quota issues

class TTSQuotaManager {
  private dailyRequests = 0;
  private readonly DAILY_LIMIT = 1000000; // 1M characters per day (free tier)
  
  async checkQuota(textLength: number): Promise<boolean> {
    if (this.dailyRequests + textLength > this.DAILY_LIMIT) {
      // Fallback: Use lower quality TTS or cache common phrases
      return false;
    }
    
    this.dailyRequests += textLength;
    return true;
  }
  
  // Solution: Cache common AI responses
  private responseCache = new Map<string, string>();
  
  async synthesizeWithCache(text: string) {
    if (this.responseCache.has(text)) {
      return this.responseCache.get(text); // Return cached audio
    }
    
    const audio = await this.synthesize(text);
    this.responseCache.set(text, audio);
    return audio;
  }
}
```

**Recommendation:** Since you're using Google TTS in another project, consider:
1. **Separate API keys** for each project (easier quota tracking)
2. **Caching strategy** for common phrases
3. **Fallback to Azure TTS** if Google quota exhausted

---

## **9. Database Schema**

```prisma
model TutorSession {
  id String @id @default(uuid())
  userId String
  user User @relation(fields: [userId], references: [id])
  
  sessionId String @unique
  
  conversationHistory Json // Array of turns with corrections
  
  feedback Json? // Generated at end of session
  
  duration Int? // Minutes
  totalTurns Int?
  mistakeCount Int?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model TutorProgress {
  id String @id @default(uuid())
  userId String
  user User @relation(fields: [userId], references: [id])
  
  totalSessions Int @default(0)
  totalMinutes Int @default(0)
  
  commonMistakes Json // Tracked across sessions
  improvement Json // Progress metrics
  
  lastSessionAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## **10. What You Need to Do**

### **Immediate Setup:**

1. ✅ **Azure Speech Key** - You have this
2. ✅ **Gemini Key** - You have this
3. ✅ **Google TTS Key** - You have this

### **Code to Create:**

**Backend (Python):**
- `hinglish_stt_service.py` - Azure STT with multi-language
- `hinglish_tts_service.py` - Google TTS with text splitting

**Backend (NestJS):**
- `conversational-tutor.service.ts` - Gemini conversation logic
- `conversational-tutor.controller.ts` - API endpoints
- `conversational-tutor.module.ts` - Module setup

**Frontend:**
- `ConversationalTutorScreen.tsx` - Real-time conversation UI
- `TutorFeedbackScreen.tsx` - Post-session feedback

---

## **Testing Strategy**

Test these scenarios:

1. **Pure English conversation** - Should work perfectly
2. **Pure Hindi conversation** - Should detect and handle
3. **Mixed Hinglish** - "I went to market aur maine sabzi khareedi"
4. **Rapid code-switching** - "Basically मैं सोच रहा था that we should..."
5. **Mistakes in Hindi** - Make sure corrections work for both languages
6. **Long pauses** - User thinking - don't interrupt
7. **Background noise** - Should handle gracefully

---

**This is EXACTLY what you need to build.