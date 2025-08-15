const express = require('express');
const { SanctuAI } = require('./sanctuai-backend'); // Make sure this matches your file name

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
    console.log(`SanctuAI server running on port ${PORT}`);
});