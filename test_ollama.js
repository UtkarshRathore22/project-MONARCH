const targetUrl = 'http://localhost:11434/api/generate';
const prompt = "I really need to finish building the landing page for my new SAAS";

fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        model: 'monarch-architect',
        prompt: prompt,
        stream: false,
        format: "json",
        options: { temperature: 0.3 }
    })
})
.then(response => response.json())
.then(data => {
    console.log("Input Thought:", prompt);
    console.log("\nArchitect Response:");
    console.log(data.response);
    
    // Test if it's valid JSON
    try {
        const parsed = JSON.parse(data.response);
        console.log("\n[SUCCESS] Output is valid JSON!");
        console.dir(parsed, {depth: null, colors: true});
    } catch (e) {
        console.log("\n[ERROR] Output is NOT valid JSON:", e.message);
    }
})
.catch(error => console.error("Error communicating with Ollama:", error));
