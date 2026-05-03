# 🦋 Project MONARCH

**The Gamified Productivity Engine powered by Fine-Tuned Intelligence.**

Project MONARCH is a state-of-the-art productivity system that transforms your real-world obligations into a high-stakes RPG experience. It leverages locally-hosted fine-tuned language models to architect your day, verify your progress, and evolve your "Player" stats.

---

## 🌟 Core Features

### ⚔️ Quest System
*   **Dynamic Architecting**: Transform vague goals into structured quests using the **Monarch Architect** (a fine-tuned Phi-3.5 model).
*   **Quest Types**: Manage **Main Quests**, **Daily Tasks**, and **Penalty Missions** (for failed objectives).
*   **Stat Alignment**: Tasks are aligned with specific player attributes: **STR** (Strength/Physical), **INT** (Intelligence/Technical), and **WIS** (Wisdom/Mindfulness).
*   **Multi-Modal Verification**: Prove your success via:
    *   **Vision**: AI-powered photo verification (Llava-Phi3).
    *   **Intellect**: Dynamic trivia challenges generated from task context.
    *   **Contribution**: Git link verification for developers.
    *   **Reflection**: Written proof of completion.

### 👤 Player Progression
*   **RPG Stats**: Track your **Level**, **XP**, and **Rank** (from Rank E to the legendary Rank S).
*   **Attribute Growth**: Gain points in STR, INT, and WIS as you complete aligned tasks.
*   **Goal Tracking**: Manage up to 5 strategic goals that guide your quest generation.

### 🧠 Fine-Tuned Intelligence
*   **Monarch Architect**: A custom-trained model optimized for structured JSON task generation and intent extraction.
*   **Strict Verification**: No more "honor system." The AI evaluates your proof data to ensure tasks are actually completed.

---

## 🛠️ Tech Stack

- **Frontend/Backend**: [Next.js 16](https://nextjs.org/) (App Router)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Database**: [Prisma](https://www.prisma.io/) with [SQLite](https://sqlite.org/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Visualization**: [Recharts](https://recharts.org/)
- **AI Engine**:
    - **Local**: [Ollama](https://ollama.com/) (Phi-3.5 fine-tunes, Llava-Phi3)
    - **Cloud**: [Google Gemini API](https://ai.google.dev/) (for dataset generation)

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (Latest LTS)
- [Ollama](https://ollama.com/)
- Python 3.10+ (for model training/export scripts)

### 2. Installation
```bash
# Clone the repository
git clone <your-repo-url>
cd project-MONARCH

# Install dependencies
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory:
```env
DATABASE_URL="file:./dev.db"
GEMINI_API_KEY="your_google_gemini_api_key"
```

### 4. Database Initialization
```bash
npx prisma db push
```

### 5. Run the Application
```bash
# Using the provided batch script
./run.bat

# Or manually
npm run dev
```

---

## 🧬 Model Training & Export

This project includes a complete pipeline for fine-tuning the Monarch Architect model using Unsloth.

- **Dataset Generation**: `generate_training_data.mjs` - Uses Gemini to create high-quality SFT and DPO datasets.
- **Training**: `train_monarch.py` - Fine-tunes Phi-3.5 on the generated datasets.
- **Export**: `export_sft_gguf.py` - Converts the trained LoRA adapters into GGUF format for use in Ollama.
- **Ollama Integration**: Use `Modelfile` to create the local `monarch-architect` model.

---

## 📜 License
MIT License - See the [LICENSE](LICENSE) file for details.
