
import re
import json
import uuid
from datetime import datetime
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, asdict
from enum import Enum
import spacy
from collections import defaultdict

class RedactionReason(Enum):
    PII = "Personal Identifiable Information"
    SYMPTOM = "Mental Health Symptom"
    EMOTION = "Emotional Reference"
    TRAUMA = "Trauma Reference"
    RELATION = "Relationship Reference"
    MEDICAL = "Medical Information"

@dataclass
class RedactionEntry:
    original_text: str
    redacted_text: str
    start_pos: int
    end_pos: int
    reason: RedactionReason
    risk_score: float
    context: str
    consent_given: bool = False
    timestamp: str = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now().isoformat()

class SanctuAI:
    def __init__(self):
        # Initialize spaCy model 
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            print("spaCy model not found. Please install: python -m spacy download en_core_web_sm")
            self.nlp = None
        
        # Enhanced mental health symptom lexicon
        self.symptom_patterns = {
            'anxiety_disorders': [
                'panic attack', 'anxiety', 'panic disorder', 'social anxiety', 'phobia',
                'generalized anxiety', 'GAD', 'agoraphobia', 'panic', 'anxious',
                'nervous breakdown', 'hyperventilation', 'heart palpitations'
            ],
            'mood_disorders': [
                'depression', 'depressed', 'bipolar', 'manic', 'mania', 'mood swings',
                'suicidal thoughts', 'suicide', 'self-harm', 'cutting', 'hopeless',
                'worthless', 'empty inside', 'emotional numbness', 'self-loathing'
            ],
            'trauma_ptsd': [
                'PTSD', 'trauma', 'flashback', 'nightmare', 'triggered', 'dissociation',
                'hypervigilant', 'avoidance', 'intrusive thoughts', 'emotional flashback',
                'complex PTSD', 'CPTSD', 'abuse survivor', 'rape survivor'
            ],
            'eating_disorders': [
                'anorexia', 'bulimia', 'binge eating', 'purging', 'body dysmorphia',
                'eating disorder', 'restrict', 'binge', 'body image issues',
                'calorie counting', 'food anxiety'
            ],
            'ocd_related': [
                'OCD', 'obsessive', 'compulsive', 'intrusive thoughts', 'ritual',
                'checking', 'contamination', 'hoarding', 'pure O', 'harm OCD'
            ],
            'substance_related': [
                'addiction', 'alcoholism', 'substance abuse', 'withdrawal', 'relapse',
                'sober', 'clean', 'recovery', 'drinking problem', 'drug problem'
            ],
            'psychotic_disorders': [
                'psychosis', 'hallucination', 'delusion', 'paranoia', 'hearing voices',
                'schizophrenia', 'schizoaffective', 'disorganized thinking'
            ]
        }
        
        # Relationship patterns with risk scores
        self.relationship_patterns = {
            'boyfriend': 0.6, 'girlfriend': 0.6, 'husband': 0.7, 'wife': 0.7, 
            'partner': 0.6, 'ex-boyfriend': 0.8, 'ex-girlfriend': 0.8, 'ex-husband': 0.9,
            'ex-wife': 0.9, 'mother': 0.7, 'father': 0.7, 'mom': 0.7, 'dad': 0.7,
            'parent': 0.7, 'child': 0.5, 'son': 0.5, 'daughter': 0.5, 'sibling': 0.6,
            'brother': 0.6, 'sister': 0.6, 'friend': 0.5, 'colleague': 0.4, 'boss': 0.7,
            'therapist': 0.8, 'doctor': 0.8, 'counselor': 0.8, 'abuser': 0.95, 'rapist': 0.95
        }
        
        # Emotional indicators with risk scores
        self.emotion_patterns = {
            'afraid': 0.7, 'scared': 0.7, 'terrified': 0.9, 'angry': 0.6, 'furious': 0.8,
            'sad': 0.5, 'devastated': 0.9, 'ashamed': 0.8, 'guilty': 0.8, 'hopeless': 0.9,
            'overwhelmed': 0.7, 'numb': 0.6, 'empty': 0.7, 'abandoned': 0.8, 'rejected': 0.8,
            'betrayed': 0.9, 'violated': 0.95, 'helpless': 0.8, 'worthless': 0.9, 'suicidal': 0.95
        }
        
        # Common names for better detection (expanded list)
        self.common_names = set([
            'john', 'jane', 'michael', 'sarah', 'david', 'lisa', 'robert', 'mary',
            'james', 'patricia', 'william', 'jennifer', 'richard', 'elizabeth',
            'charles', 'linda', 'joseph', 'barbara', 'thomas', 'susan', 'kevin',
            'jessica', 'matthew', 'emily', 'christopher', 'amanda', 'daniel', 'ashley',
            'mark', 'michelle', 'paul', 'kimberly', 'steven', 'melissa', 'andrew',
            'rebecca', 'kenneth', 'laura', 'joshua', 'heather', 'ryan', 'amy'
        ])
        
        # Medical terms
        self.medical_terms = [
            'medication', 'prescription', 'antidepressant', 'SSRI', 'SNRI', 'benzodiazepine',
            'therapy', 'counseling', 'psychiatrist', 'psychologist', 'diagnosis', 'treatment',
            'dosage', 'side effects', 'withdrawal symptoms', 'mental health', 'psych ward',
            'hospitalization', 'inpatient', 'outpatient'
        ]
        
        self.redaction_log = []
        self.session_id = str(uuid.uuid4())
    
    def detect_symptoms(self, text: str) -> List[Tuple[str, str, float]]:
        """Detect mental health symptoms in text with context"""
        symptoms_found = []
        text_lower = text.lower()
        
        for category, symptoms in self.symptom_patterns.items():
            for symptom in symptoms:
                pattern = r'\b' + re.escape(symptom.lower()) + r'\b'
                matches = re.finditer(pattern, text_lower)
                # Calculate risk score based on symptom severity and context
                for match in matches:
                    risk_score = self._calculate_symptom_risk(symptom, category, text_lower)
                    symptoms_found.append((match.group(), category, risk_score))
        
        return symptoms_found
    
    def detect_emotions(self, text: str) -> List[Tuple[str, float]]:
        """Detect emotional indicators with contextual risk assessment"""
        emotions_found = []
        text_lower = text.lower()
        
        for emotion, base_score in self.emotion_patterns.items():
            pattern = r'\b' + re.escape(emotion) + r'\b'
            matches = re.finditer(pattern, text_lower)
            # Adjust risk based on surrounding context
            for match in matches:
                risk_score = self._adjust_emotion_risk(base_score, match.start(), match.end(), text)
                emotions_found.append((match.group(), risk_score))
        
        return emotions_found
    
    def detect_relationships(self, text: str) -> List[Tuple[str, float]]:
        """Detect relationship references with risk scoring"""
        relationships_found = []
        text_lower = text.lower()
        
        for relation, base_score in self.relationship_patterns.items():
            pattern = r'\b' + re.escape(relation) + r'\b'
            matches = re.finditer(pattern, text_lower)
             # Adjust risk based on context
            for match in matches:
                risk_score = self._adjust_relation_risk(base_score, match.start(), match.end(), text)
                relationships_found.append((match.group(), risk_score))
        
        return relationships_found
    
    def detect_names_with_context(self, text: str) -> List[Tuple[str, float, str]]:
        """Detect names and assess risk based on context using NLP"""
        if not self.nlp:
            return []
        
        doc = self.nlp(text)
        names_found = []
        
        for ent in doc.ents:
            if ent.label_ == "PERSON":
                # Get context around the name
                start_idx = max(0, ent.start - 10)
                end_idx = min(len(doc), ent.end + 10)
                context = doc[start_idx:end_idx].text
                
                # Calculate risk based on context
                risk_score = self._calculate_name_risk(ent.text, context)
                names_found.append((ent.text, risk_score, context))
        
        # Also check for common names that might have been missed by NER
        for name in self.common_names:
            pattern = r'\b' + re.escape(name) + r'\b'
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                # Check if this was already found by NER
                found = any(n.lower() == name.lower() for n, _, _ in names_found)
                if not found:
                    context = text[max(0, match.start()-50):min(len(text), match.end()+50)]
                    risk_score = self._calculate_name_risk(match.group(), context)
                    names_found.append((match.group(), risk_score, context))
        
        return names_found
    
    def detect_medical_info(self, text: str) -> List[Tuple[str, float]]:
        """Detect medical information references"""
        medical_found = []
        text_lower = text.lower()
        
        for term in self.medical_terms:
            pattern = r'\b' + re.escape(term.lower()) + r'\b'
            matches = re.finditer(pattern, text_lower)
            for match in matches:
                risk_score = 0.7  # Moderate risk for medical info
                medical_found.append((match.group(), risk_score))
        
        return medical_found
    
    def _calculate_symptom_risk(self, symptom: str, category: str, context: str) -> float:
        """Calculate risk score for symptoms with context analysis"""
        high_risk_categories = ['trauma_ptsd', 'mood_disorders', 'psychotic_disorders']
        high_risk_symptoms = [
            'suicide', 'self-harm', 'cutting', 'PTSD', 'trauma', 
            'psychosis', 'hallucination', 'delusion', 'rape survivor'
        ]
        
        # Base risk
        if category in high_risk_categories or symptom.lower() in high_risk_symptoms:
            risk_score = 0.9
        else:
            risk_score = 0.7
        
        # Context adjustments
        context = context.lower()
        if any(word in context for word in ['suicide', 'kill myself', 'end it all']):
            risk_score = min(risk_score + 0.2, 1.0)
        if any(word in context for word in ['abuse', 'assault', 'rape', 'violence']):
            risk_score = min(risk_score + 0.15, 1.0)
        if 'hospital' in context or 'emergency' in context:
            risk_score = min(risk_score + 0.1, 1.0)
        
        return risk_score
    
    def _adjust_emotion_risk(self, base_score: float, start: int, end: int, text: str) -> float:
        """Adjust emotion risk based on surrounding context"""
        context_window = text[max(0, start-50):min(len(text), end+50)].lower()
        
        risk_score = base_score
        
        # Increase risk if in context with high-risk words
        if any(word in context_window for word in ['suicide', 'kill', 'die', 'end my life']):
            risk_score = min(risk_score + 0.3, 1.0)
        elif any(word in context_window for word in ['abuse', 'trauma', 'assault']):
            risk_score = min(risk_score + 0.2, 1.0)
        elif any(word in context_window for word in ['can\'t take it', 'can\'t go on']):
            risk_score = min(risk_score + 0.15, 1.0)
        
        return risk_score
    
    def _adjust_relation_risk(self, base_score: float, start: int, end: int, text: str) -> float:
        """Adjust relationship risk based on surrounding context"""
        context_window = text[max(0, start-50):min(len(text), end+50)].lower()
        
        risk_score = base_score
        
        # Increase risk if relationship is mentioned with negative context
        if any(word in context_window for word in ['abuse', 'hit', 'yell', 'hurt', 'violence']):
            risk_score = min(risk_score + 0.3, 1.0)
        elif any(word in context_window for word in ['left me', 'cheat', 'betray']):
            risk_score = min(risk_score + 0.2, 1.0)
        elif any(word in context_window for word in ['scared', 'afraid', 'fear']):
            risk_score = min(risk_score + 0.15, 1.0)
        
        return risk_score
    
    def _calculate_name_risk(self, name: str, context: str) -> float:
        """Calculate risk score for names based on context"""
        context_lower = context.lower()
        
        # High risk indicators
        trauma_indicators = [
            'hurt', 'abuse', 'violence', 'assault', 'attack', 'yelled', 
            'hit', 'rape', 'molest', 'trauma', 'trigger'
        ]
        negative_indicators = [
            'ex-', 'afraid', 'scared', 'angry', 'hate', 'avoid', 
            'fear', 'terrified', 'nightmare'
        ]
        
        risk_score = 0.5  # Base risk for any name
        
        # Increase risk based on context
        for indicator in trauma_indicators:
            if indicator in context_lower:
                risk_score = min(risk_score + 0.3, 1.0)
                break
        
        for indicator in negative_indicators:
            if indicator in context_lower:
                risk_score = min(risk_score + 0.2, 1.0)
                break
        
        # Check if name is part of a professional title (lower risk)
        if any(title in context_lower for title in ['dr.', 'doctor', 'therapist', 'counselor']):
            risk_score = max(risk_score - 0.2, 0.3)
        
        return risk_score
    
    def redact_text(self, text: str, consent_given: bool = False) -> Tuple[str, List[RedactionEntry]]:
        """Main redaction function with comprehensive processing"""
        redacted_text = text
        redaction_entries = []
        
        # Detect all sensitive elements
        symptoms = self.detect_symptoms(text)
        emotions = self.detect_emotions(text)
        relationships = self.detect_relationships(text)
        names = self.detect_names_with_context(text)
        medical_info = self.detect_medical_info(text)
        
        # Collect all redaction candidates
        redaction_candidates = []
        
        # Add symptoms
        for symptom, category, risk_score in symptoms:
            for match in re.finditer(r'\b' + re.escape(symptom.lower()) + r'\b', text.lower()):
                redaction_candidates.append({
                    'start': match.start(),
                    'end': match.end(),
                    'text': text[match.start():match.end()],
                    'reason': RedactionReason.SYMPTOM,
                    'risk_score': risk_score,
                    'context': category
                })
        
        # Add emotions
        for emotion, risk_score in emotions:
            for match in re.finditer(r'\b' + re.escape(emotion) + r'\b', text.lower()):
                redaction_candidates.append({
                    'start': match.start(),
                    'end': match.end(),
                    'text': text[match.start():match.end()],
                    'reason': RedactionReason.EMOTION,
                    'risk_score': risk_score,
                    'context': 'emotional_expression'
                })
        
        # Add relationships
        for relation, risk_score in relationships:
            for match in re.finditer(r'\b' + re.escape(relation) + r'\b', text.lower()):
                redaction_candidates.append({
                    'start': match.start(),
                    'end': match.end(),
                    'text': text[match.start():match.end()],
                    'reason': RedactionReason.RELATION,
                    'risk_score': risk_score,
                    'context': 'relationship_reference'
                })
        
        # Add names
        for name, risk_score, context in names:
            for match in re.finditer(r'\b' + re.escape(name) + r'\b', text):
                redaction_candidates.append({
                    'start': match.start(),
                    'end': match.end(),
                    'text': name,
                    'reason': RedactionReason.PII,
                    'risk_score': risk_score,
                    'context': context
                })
        
        # Add medical info
        for term, risk_score in medical_info:
            for match in re.finditer(r'\b' + re.escape(term.lower()) + r'\b', text.lower()):
                redaction_candidates.append({
                    'start': match.start(),
                    'end': match.end(),
                    'text': text[match.start():match.end()],
                    'reason': RedactionReason.MEDICAL,
                    'risk_score': risk_score,
                    'context': 'medical_information'
                })
        
        # Sort by position (reverse order to maintain indices)
        redaction_candidates.sort(key=lambda x: x['start'], reverse=True)
        
        # Remove duplicates and overlaps, keeping highest risk
        final_candidates = self._remove_overlaps(redaction_candidates)
        
        # Apply redactions
        for candidate in final_candidates:
            start, end = candidate['start'], candidate['end']
            original = candidate['text']
            reason = candidate['reason']
            
            # Generate redaction tag based on risk level
            if candidate['risk_score'] > 0.8:
                redaction_tag = f"[REDACTED_HIGH_RISK:{reason.name}]"
            elif candidate['risk_score'] > 0.5:
                redaction_tag = f"[REDACTED:{reason.name}]"
            else:
                redaction_tag = f"[ANONYMIZED:{reason.name}]"
            
            # Create redaction entry
            entry = RedactionEntry(
                original_text=original,
                redacted_text=redaction_tag,
                start_pos=start,
                end_pos=end,
                reason=reason,
                risk_score=candidate['risk_score'],
                context=candidate['context'],
                consent_given=consent_given
            )
            
            redaction_entries.append(entry)
            
            # Apply redaction to text
            redacted_text = redacted_text[:start] + redaction_tag + redacted_text[end:]
        
        # Store in log
        self.redaction_log.extend(redaction_entries)
        
        return redacted_text, redaction_entries
    
    def _remove_overlaps(self, candidates: List[Dict]) -> List[Dict]:
        """Remove overlapping redaction candidates, keeping highest risk"""
        if not candidates:
            return []
        
        # Sort by start position
        candidates.sort(key=lambda x: x['start'])
        result = [candidates[0]]
        
        for current in candidates[1:]:
            last = result[-1]
            
            # Check for overlap
            if current['start'] < last['end']:
                # Keep the one with higher risk score
                if current['risk_score'] > last['risk_score']:
                    result[-1] = current
            else:
                result.append(current)
        
        return result
    
    def generate_audit_log(self) -> Dict:
        """Generate comprehensive audit log with statistics"""
        if not self.redaction_log:
            return {}
            
        # Calculate risk distribution
        risk_distribution = {
            'low': len([r for r in self.redaction_log if r.risk_score <= 0.5]),
            'medium': len([r for r in self.redaction_log if 0.5 < r.risk_score <= 0.8]),
            'high': len([r for r in self.redaction_log if r.risk_score > 0.8])
        }
        
        # Calculate privacy protection score (0-100)
        total_redactions = len(self.redaction_log)
        if total_redactions > 0:
            high_risk_redactions = risk_distribution['high']
            privacy_score = min(100, 80 + (high_risk_redactions * 2))
        else:
            privacy_score = 100
        
        return {
            'session_id': self.session_id,
            'timestamp': datetime.now().isoformat(),
            'total_redactions': total_redactions,
            'risk_distribution': risk_distribution,
            'privacy_score': privacy_score,
            'redaction_summary': {
                reason.name: len([r for r in self.redaction_log if r.reason == reason])
                for reason in RedactionReason
            },
            'high_risk_redactions': risk_distribution['high'],
            'consent_status': {
                'consented': len([r for r in self.redaction_log if r.consent_given]),
                'not_consented': len([r for r in self.redaction_log if not r.consent_given])
            },
            'detailed_entries': [asdict(entry) for entry in self.redaction_log]
        }
    
    def export_clean_text(self, original_text: str) -> str:
        """Export clean version for research use with full consent"""
        clean_text, _ = self.redact_text(original_text, consent_given=True)
        return clean_text
    
    def reset_session(self):
        """Reset the current session"""
        self.redaction_log = []
        self.session_id = str(uuid.uuid4())

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))  # Render uses $PORT
    app.run(host='0.0.0.0', port=port)
