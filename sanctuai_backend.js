
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const natural = require('natural');
const compromise = require('compromise');

class RedactionReason {
    static PII = "Personal Identifiable Information";
    static SYMPTOM = "Mental Health Symptom";
    static EMOTION = "Emotional Reference";
    static TRAUMA = "Trauma Reference";
    static RELATION = "Relationship Reference";
    static MEDICAL = "Medical Information";
}

class RedactionEntry {
    constructor(original_text, redacted_text, start_pos, end_pos, reason, risk_score, context, consent_given = false) {
        this.original_text = original_text;
        this.redacted_text = redacted_text;
        this.start_pos = start_pos;
        this.end_pos = end_pos;
        this.reason = reason;
        this.risk_score = risk_score;
        this.context = context;
        this.consent_given = consent_given;
        this.timestamp = new Date().toISOString();
    }
}

class SanctuAI {
    constructor() {
        // Initialize NLP tools
        this.tokenizer = new natural.WordTokenizer();
        
        // Enhanced mental health symptom lexicon
        this.symptomPatterns = {
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
        };
        
        // Relationship patterns with risk scores
        this.relationshipPatterns = {
            'boyfriend': 0.6, 'girlfriend': 0.6, 'husband': 0.7, 'wife': 0.7, 
            'partner': 0.6, 'ex-boyfriend': 0.8, 'ex-girlfriend': 0.8, 'ex-husband': 0.9,
            'ex-wife': 0.9, 'mother': 0.7, 'father': 0.7, 'mom': 0.7, 'dad': 0.7,
            'parent': 0.7, 'child': 0.5, 'son': 0.5, 'daughter': 0.5, 'sibling': 0.6,
            'brother': 0.6, 'sister': 0.6, 'friend': 0.5, 'colleague': 0.4, 'boss': 0.7,
            'therapist': 0.8, 'doctor': 0.8, 'counselor': 0.8, 'abuser': 0.95, 'rapist': 0.95
        };
        
        // Emotional indicators with risk scores
        this.emotionPatterns = {
            'afraid': 0.7, 'scared': 0.7, 'terrified': 0.9, 'angry': 0.6, 'furious': 0.8,
            'sad': 0.5, 'devastated': 0.9, 'ashamed': 0.8, 'guilty': 0.8, 'hopeless': 0.9,
            'overwhelmed': 0.7, 'numb': 0.6, 'empty': 0.7, 'abandoned': 0.8, 'rejected': 0.8,
            'betrayed': 0.9, 'violated': 0.95, 'helpless': 0.8, 'worthless': 0.9, 'suicidal': 0.95
        };
        
        // Common names for better detection (expanded list)
        this.commonNames = new Set([
            'john', 'jane', 'michael', 'sarah', 'david', 'lisa', 'robert', 'mary',
            'james', 'patricia', 'william', 'jennifer', 'richard', 'elizabeth',
            'charles', 'linda', 'joseph', 'barbara', 'thomas', 'susan', 'kevin',
            'jessica', 'matthew', 'emily', 'christopher', 'amanda', 'daniel', 'ashley',
            'mark', 'michelle', 'paul', 'kimberly', 'steven', 'melissa', 'andrew',
            'rebecca', 'kenneth', 'laura', 'joshua', 'heather', 'ryan', 'amy'
        ]);
        
        // Medical terms
        this.medicalTerms = [
            'medication', 'prescription', 'antidepressant', 'SSRI', 'SNRI', 'benzodiazepine',
            'therapy', 'counseling', 'psychiatrist', 'psychologist', 'diagnosis', 'treatment',
            'dosage', 'side effects', 'withdrawal symptoms', 'mental health', 'psych ward',
            'hospitalization', 'inpatient', 'outpatient'
        ];
        
        this.redactionLog = [];
        this.sessionId = uuidv4();
    }
    
    detectSymptoms(text) {
        const symptomsFound = [];
        const textLower = text.toLowerCase();
        
        for (const [category, symptoms] of Object.entries(this.symptomPatterns)) {
            for (const symptom of symptoms) {
                const pattern = new RegExp('\\b' + this.escapeRegExp(symptom.toLowerCase()) + '\\b', 'gi');
                let match;
                while ((match = pattern.exec(textLower)) !== null) {
                    const riskScore = this.calculateSymptomRisk(symptom, category, textLower);
                    symptomsFound.push({
                        text: match[0],
                        category,
                        riskScore
                    });
                }
            }
        }
        
        return symptomsFound;
    }
    
    detectEmotions(text) {
        const emotionsFound = [];
        const textLower = text.toLowerCase();
        
        for (const [emotion, baseScore] of Object.entries(this.emotionPatterns)) {
            const pattern = new RegExp('\\b' + this.escapeRegExp(emotion) + '\\b', 'gi');
            let match;
            while ((match = pattern.exec(textLower)) !== null) {
                const riskScore = this.adjustEmotionRisk(baseScore, match.index, match.index + match[0].length, text);
                emotionsFound.push({
                    text: match[0],
                    riskScore
                });
            }
        }
        
        return emotionsFound;
    }
    
    detectRelationships(text) {
        const relationshipsFound = [];
        const textLower = text.toLowerCase();
        
        for (const [relation, baseScore] of Object.entries(this.relationshipPatterns)) {
            const pattern = new RegExp('\\b' + this.escapeRegExp(relation) + '\\b', 'gi');
            let match;
            while ((match = pattern.exec(textLower)) !== null) {
                const riskScore = this.adjustRelationRisk(baseScore, match.index, match.index + match[0].length, text);
                relationshipsFound.push({
                    text: match[0],
                    riskScore
                });
            }
        }
        
        return relationshipsFound;
    }
    
    detectNamesWithContext(text) {
        const namesFound = [];
        const doc = compromise(text);
        
        // Extract people names using compromise
        const people = doc.people().out('array');
        for (const name of people) {
            // Get context around the name
            const nameIndex = text.indexOf(name);
            if (nameIndex === -1) continue;
            
            const startIdx = Math.max(0, nameIndex - 50);
            const endIdx = Math.min(text.length, nameIndex + name.length + 50);
            const context = text.substring(startIdx, endIdx);
            
            const riskScore = this.calculateNameRisk(name, context);
            namesFound.push({
                text: name,
                riskScore,
                context
            });
        }
        
        // Also check for common names that might have been missed
        for (const name of this.commonNames) {
            const pattern = new RegExp('\\b' + this.escapeRegExp(name) + '\\b', 'gi');
            let match;
            while ((match = pattern.exec(text)) !== null) {
                // Check if this was already found
                const found = namesFound.some(n => n.text.toLowerCase() === name.toLowerCase());
                if (!found) {
                    const context = text.substring(
                        Math.max(0, match.index - 50),
                        Math.min(text.length, match.index + match[0].length + 50)
                    );
                    const riskScore = this.calculateNameRisk(match[0], context);
                    namesFound.push({
                        text: match[0],
                        riskScore,
                        context
                    });
                }
            }
        }
        
        return namesFound;
    }
    
    detectMedicalInfo(text) {
        const medicalFound = [];
        const textLower = text.toLowerCase();
        
        for (const term of this.medicalTerms) {
            const pattern = new RegExp('\\b' + this.escapeRegExp(term.toLowerCase()) + '\\b', 'gi');
            let match;
            while ((match = pattern.exec(textLower)) !== null) {
                medicalFound.push({
                    text: match[0],
                    riskScore: 0.7
                });
            }
        }
        
        return medicalFound;
    }
    
    calculateSymptomRisk(symptom, category, context) {
        const highRiskCategories = ['trauma_ptsd', 'mood_disorders', 'psychotic_disorders'];
        const highRiskSymptoms = [
            'suicide', 'self-harm', 'cutting', 'PTSD', 'trauma', 
            'psychosis', 'hallucination', 'delusion', 'rape survivor'
        ];
        
        // Base risk
        let riskScore = highRiskCategories.includes(category) || 
                       highRiskSymptoms.includes(symptom.toLowerCase()) ? 0.9 : 0.7;
        
        // Context adjustments
        const contextLower = context.toLowerCase();
        if (['suicide', 'kill myself', 'end it all'].some(word => contextLower.includes(word))) {
            riskScore = Math.min(riskScore + 0.2, 1.0);
        }
        if (['abuse', 'assault', 'rape', 'violence'].some(word => contextLower.includes(word))) {
            riskScore = Math.min(riskScore + 0.15, 1.0);
        }
        if (contextLower.includes('hospital') || contextLower.includes('emergency')) {
            riskScore = Math.min(riskScore + 0.1, 1.0);
        }
        
        return riskScore;
    }
    
    adjustEmotionRisk(baseScore, start, end, text) {
        const contextWindow = text.substring(
            Math.max(0, start - 50),
            Math.min(text.length, end + 50)
        ).toLowerCase();
        
        let riskScore = baseScore;
        
        // Increase risk if in context with high-risk words
        if (['suicide', 'kill', 'die', 'end my life'].some(word => contextWindow.includes(word))) {
            riskScore = Math.min(riskScore + 0.3, 1.0);
        } else if (['abuse', 'trauma', 'assault'].some(word => contextWindow.includes(word))) {
            riskScore = Math.min(riskScore + 0.2, 1.0);
        } else if (['can\'t take it', 'can\'t go on'].some(word => contextWindow.includes(word))) {
            riskScore = Math.min(riskScore + 0.15, 1.0);
        }
        
        return riskScore;
    }
    
    adjustRelationRisk(baseScore, start, end, text) {
        const contextWindow = text.substring(
            Math.max(0, start - 50),
            Math.min(text.length, end + 50)
        ).toLowerCase();
        
        let riskScore = baseScore;
        
        // Increase risk if relationship is mentioned with negative context
        if (['abuse', 'hit', 'yell', 'hurt', 'violence'].some(word => contextWindow.includes(word))) {
            riskScore = Math.min(riskScore + 0.3, 1.0);
        } else if (['left me', 'cheat', 'betray'].some(word => contextWindow.includes(word))) {
            riskScore = Math.min(riskScore + 0.2, 1.0);
        } else if (['scared', 'afraid', 'fear'].some(word => contextWindow.includes(word))) {
            riskScore = Math.min(riskScore + 0.15, 1.0);
        }
        
        return riskScore;
    }
    
    calculateNameRisk(name, context) {
        const contextLower = context.toLowerCase();
        
        // High risk indicators
        const traumaIndicators = [
            'hurt', 'abuse', 'violence', 'assault', 'attack', 'yelled', 
            'hit', 'rape', 'molest', 'trauma', 'trigger'
        ];
        const negativeIndicators = [
            'ex-', 'afraid', 'scared', 'angry', 'hate', 'avoid', 
            'fear', 'terrified', 'nightmare'
        ];
        
        let riskScore = 0.5;  // Base risk for any name
        
        // Increase risk based on context
        for (const indicator of traumaIndicators) {
            if (contextLower.includes(indicator)) {
                riskScore = Math.min(riskScore + 0.3, 1.0);
                break;
            }
        }
        
        for (const indicator of negativeIndicators) {
            if (contextLower.includes(indicator)) {
                riskScore = Math.min(riskScore + 0.2, 1.0);
                break;
            }
        }
        
        // Check if name is part of a professional title (lower risk)
        if (['dr.', 'doctor', 'therapist', 'counselor'].some(title => contextLower.includes(title))) {
            riskScore = Math.max(riskScore - 0.2, 0.3);
        }
        
        return riskScore;
    }
    
    redactText(text, consentGiven = false) {
        let redactedText = text;
        const redactionEntries = [];
        
        // Detect all sensitive elements
        const symptoms = this.detectSymptoms(text);
        const emotions = this.detectEmotions(text);
        const relationships = this.detectRelationships(text);
        const names = this.detectNamesWithContext(text);
        const medicalInfo = this.detectMedicalInfo(text);
        
        // Collect all redaction candidates
        const redactionCandidates = [];
        
        // Add symptoms
        for (const {text: symptom, category, riskScore} of symptoms) {
            const pattern = new RegExp('\\b' + this.escapeRegExp(symptom.toLowerCase()) + '\\b', 'gi');
            let match;
            while ((match = pattern.exec(text.toLowerCase())) !== null) {
                redactionCandidates.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    text: text.substring(match.index, match.index + match[0].length),
                    reason: RedactionReason.SYMPTOM,
                    riskScore,
                    context: category
                });
            }
        }
        
        // Add emotions
        for (const {text: emotion, riskScore} of emotions) {
            const pattern = new RegExp('\\b' + this.escapeRegExp(emotion) + '\\b', 'gi');
            let match;
            while ((match = pattern.exec(text.toLowerCase())) !== null) {
                redactionCandidates.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    text: text.substring(match.index, match.index + match[0].length),
                    reason: RedactionReason.EMOTION,
                    riskScore,
                    context: 'emotional_expression'
                });
            }
        }
        
        // Add relationships
        for (const {text: relation, riskScore} of relationships) {
            const pattern = new RegExp('\\b' + this.escapeRegExp(relation) + '\\b', 'gi');
            let match;
            while ((match = pattern.exec(text.toLowerCase())) !== null) {
                redactionCandidates.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    text: text.substring(match.index, match.index + match[0].length),
                    reason: RedactionReason.RELATION,
                    riskScore,
                    context: 'relationship_reference'
                });
            }
        }
        
        // Add names
        for (const {text: name, riskScore, context} of names) {
            const pattern = new RegExp('\\b' + this.escapeRegExp(name) + '\\b', 'g');
            let match;
            while ((match = pattern.exec(text)) !== null) {
                redactionCandidates.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    text: name,
                    reason: RedactionReason.PII,
                    riskScore,
                    context
                });
            }
        }
        
        // Add medical info
        for (const {text: term, riskScore} of medicalInfo) {
            const pattern = new RegExp('\\b' + this.escapeRegExp(term.toLowerCase()) + '\\b', 'gi');
            let match;
            while ((match = pattern.exec(text.toLowerCase())) !== null) {
                redactionCandidates.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    text: text.substring(match.index, match.index + match[0].length),
                    reason: RedactionReason.MEDICAL,
                    riskScore,
                    context: 'medical_information'
                });
            }
        }
        
        // Sort by position (reverse order to maintain indices)
        redactionCandidates.sort((a, b) => b.start - a.start);
        
        // Remove duplicates and overlaps, keeping highest risk
        const finalCandidates = this.removeOverlaps(redactionCandidates);
        
        // Apply redactions
        for (const candidate of finalCandidates) {
            const {start, end, text: original, reason, riskScore, context} = candidate;
            
            // Generate redaction tag based on risk level
            let redactionTag;
            if (riskScore > 0.8) {
                redactionTag = `[REDACTED_HIGH_RISK:${reason}]`;
            } else if (riskScore > 0.5) {
                redactionTag = `[REDACTED:${reason}]`;
            } else {
                redactionTag = `[ANONYMIZED:${reason}]`;
            }
            
            // Create redaction entry
            const entry = new RedactionEntry(
                original,
                redactionTag,
                start,
                end,
                reason,
                riskScore,
                context,
                consentGiven
            );
            
            redactionEntries.push(entry);
            
            // Apply redaction to text
            redactedText = redactedText.substring(0, start) + redactionTag + redactedText.substring(end);
        }
        
        // Store in log
        this.redactionLog.push(...redactionEntries);
        
        return {
            redactedText,
            redactionEntries
        };
    }
    
    removeOverlaps(candidates) {
        if (candidates.length === 0) return [];
        
        // Sort by start position
        candidates.sort((a, b) => a.start - b.start);
        const result = [candidates[0]];
        
        for (let i = 1; i < candidates.length; i++) {
            const current = candidates[i];
            const last = result[result.length - 1];
            
            // Check for overlap
            if (current.start < last.end) {
                // Keep the one with higher risk score
                if (current.riskScore > last.riskScore) {
                    result[result.length - 1] = current;
                }
            } else {
                result.push(current);
            }
        }
        
        return result;
    }
    
    generateAuditLog() {
        if (this.redactionLog.length === 0) {
            return {};
        }
            
        // Calculate risk distribution
        const riskDistribution = {
            low: this.redactionLog.filter(r => r.risk_score <= 0.5).length,
            medium: this.redactionLog.filter(r => r.risk_score > 0.5 && r.risk_score <= 0.8).length,
            high: this.redactionLog.filter(r => r.risk_score > 0.8).length
        };
        
        // Calculate privacy protection score (0-100)
        const totalRedactions = this.redactionLog.length;
        let privacyScore;
        if (totalRedactions > 0) {
            const highRiskRedactions = riskDistribution.high;
            privacyScore = Math.min(100, 80 + (highRiskRedactions * 2));
        } else {
            privacyScore = 100;
        }
        
        // Count redactions by reason
        const redactionSummary = {};
        for (const reason in RedactionReason) {
            if (RedactionReason.hasOwnProperty(reason)) {
                redactionSummary[reason] = this.redactionLog.filter(r => r.reason === RedactionReason[reason]).length;
            }
        }
        
        return {
            session_id: this.sessionId,
            timestamp: new Date().toISOString(),
            total_redactions: totalRedactions,
            risk_distribution: riskDistribution,
            privacy_score: privacyScore,
            redaction_summary: redactionSummary,
            high_risk_redactions: riskDistribution.high,
            consent_status: {
                consented: this.redactionLog.filter(r => r.consent_given).length,
                not_consented: this.redactionLog.filter(r => !r.consent_given).length
            },
            detailed_entries: this.redactionLog.map(entry => ({
                original_text: entry.original_text,
                redacted_text: entry.redacted_text,
                start_pos: entry.start_pos,
                end_pos: entry.end_pos,
                reason: entry.reason,
                risk_score: entry.risk_score,
                context: entry.context,
                consent_given: entry.consent_given,
                timestamp: entry.timestamp
            }))
        };
    }
    
    exportCleanText(originalText) {
        const { redactedText } = this.redactText(originalText, true);
        return redactedText;
    }
    
    resetSession() {
        this.redactionLog = [];
        this.sessionId = uuidv4();
    }
    
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// Example Express.js endpoint
/*
const express = require('express');
const app = express();
app.use(express.json());

app.post('/redact', (req, res) => {
    const { text, consent_given = false } = req.body;
    const redactor = new SanctuAI();
    
    try {
        const { redactedText, redactionEntries } = redactor.redactText(text, consent_given);
        const auditLog = redactor.generateAuditLog();
        
        res.json({
            redacted_text: redactedText,
            audit_log: auditLog,
            redaction_entries: redactionEntries
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
*/

module.exports = { SanctuAI, RedactionReason, RedactionEntry };