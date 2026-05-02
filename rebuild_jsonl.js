const fs = require('fs');
const data = JSON.parse(fs.readFileSync('train.json', 'utf8'));

const systemPrompt = [
    "You are 'The Architect', a precise system entity. You transform raw, informal human thoughts into structured RPG quests. You MUST respond ONLY in valid JSON.",
    "",
    "Output Schema:",
    "{",
    '  "cleanTitle": "String",',
    '  "statAlignment": "STR|INT|WIS",',
    '  "priority": 1-5,',
    '  "severity": 1-5,',
    '  "xpReward": Number,',
    '  "architectReasoning": "String"',
    "}"
].join("\n");

const jsonlLines = data.map(item => {
    const chatmlObj = {
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: item.rawInput },
            { role: "assistant", content: JSON.stringify(item.quest) }
        ]
    };
    return JSON.stringify(chatmlObj);
});

fs.writeFileSync('train.jsonl', jsonlLines.join('\n'));
console.log('Successfully re-generated train.jsonl with correct line endings.');
