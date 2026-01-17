# MOONLIT Project - Interview Q&A for Accenture ASE Role

---

## 1. Project Overview Questions

### Q1: Can you briefly explain what your project is about?
**Answer:** Moonlit is a **web-based Agentic AI platform** that allows users to interact with relational databases using natural language. Instead of writing complex SQL queries manually, users can simply describe what they want in plain English, and the AI agent autonomously figures out the SQL, executes it, and returns the results. It supports multiple databases like PostgreSQL, MySQL, SQLite, Oracle, and SQL Server—both local and remote connections.

---

### Q2: Is this a group project?
**Answer:** No, this project is completely built on top of my own idea and addresses a real problem I faced while working with databases. I conceptualized, designed, and developed the entire application independently.

---

### Q3: If this had been a group project, what role would you have played?
**Answer:** Since I am good at brainstorming, coming up with innovative approaches, and structuring solutions, I would have taken the role of a **Team Lead or Technical Architect**. I would lead my team by defining the project vision, breaking down tasks, and guiding team members to achieve the desired outcomes efficiently.

---

### Q4: What is the real-world application of this project?
**Answer:** 
- **Database Engineers & DBAs:** Quickly explore schemas, understand table relationships, and analyze constraints without memorizing syntax for different databases.
- **Business Analysts:** Get data insights by asking questions in plain English without SQL knowledge.
- **Developers:** Speed up development by generating queries through natural language.
- **Students & Learners:** Learn SQL by observing how the AI converts their questions into actual queries.

---

### Q5: Why did you build this project?
**Answer:** While working with multiple databases at different times, I faced a recurring problem: **remembering the exact SQL syntax for different database systems**. PostgreSQL, MySQL, Oracle—each has subtle differences. I wanted a tool where I could just describe what I need, and the system would handle the syntax details. This project solves that pain point by acting as an intelligent assistant that understands database context and generates accurate queries.

---

### Q6: Why did you name it "Moonlit"?
**Answer:** The name **Moonlit** symbolizes **illumination in darkness**. Just like moonlight helps you navigate through the dark, this tool illuminates the path for database users who struggle with complex queries or unfamiliar database systems. It sheds light on database structures and helps users find their way through data.

---

## 2. Technical Approach Questions

### Q7: What technologies did you use in this project?
**Answer:**
| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, Vite, Material UI |
| **Backend** | Python, FastAPI |
| **Database Support** | PostgreSQL, MySQL, SQLite, Oracle, SQL Server |
| **AI/LLM** | Cerebras Cloud SDK |
| **Authentication** | Firebase Admin SDK |
| **Session & Caching** | Redis (Upstash) |

---

### Q8: Why did you choose FastAPI for the backend instead of Flask or Django?
**Answer:** FastAPI provides:
- **Async support** — Essential for handling multiple concurrent database connections and LLM requests.
- **Automatic API documentation** — Built-in Swagger UI for easy testing.
- **High performance** — One of the fastest Python frameworks.
- **Type safety** — Pydantic models ensure request/response validation.

---

### Q9: How does the AI understand and process user queries?
**Answer:** The system follows an **agentic AI pattern**:
1. User sends a natural language prompt.
2. AI **reasons** about the request and database context.
3. AI **plans** required steps (e.g., fetch schema, then write query).
4. AI **executes** tool calls like `get_database_schema` or `execute_query`.
5. AI **iterates** based on results until the task is complete.

This is different from simple chatbots because the AI autonomously decides what tools to use and in what sequence.

---

### Q10: How do you ensure security in your application?
**Answer:**
- **Read-only queries** — Only SELECT statements are allowed; no INSERT/UPDATE/DELETE.
- **Firebase token verification** — Cryptographic authentication for all requests.
- **Rate limiting** — Per-user quotas to prevent abuse.
- **Query timeouts** — Prevents long-running queries from blocking resources.
- **CORS restrictions** — Only allowed origins can access the API.

---

## 3. Feature & Functionality Questions

### Q11: What databases does your project support?
**Answer:** The project supports:
- PostgreSQL
- MySQL
- SQLite
- Oracle
- SQL Server

Both local file-based databases (like SQLite) and remote database servers are supported.

---

### Q12: How do you handle user authentication?
**Answer:** I use **Firebase Authentication**. Users sign in through Firebase on the frontend, receive an ID token, which is then verified by the backend using Firebase Admin SDK. This ensures secure, cryptographically verified authentication.

---

### Q13: How do you store conversation history?
**Answer:** Conversations are stored in **Firebase Firestore**. Each user has their own conversation threads that persist across sessions, so they can continue previous chats anytime.

---

### Q14: What is rate limiting and why did you implement it?
**Answer:** Rate limiting controls how many requests a user can make in a given time period. I implemented a **two-layer system**:
1. **Per-user quota** — Tracks requests per minute/hour/day using Redis.
2. **Global LLM limiter** — Balances load across multiple API keys.

This prevents abuse, controls costs, and ensures fair usage across all users.

---

## 4. Problem-Solving Questions

### Q15: What was the most challenging part of this project?
**Answer:** The most challenging part was implementing the **agentic AI loop**—making the AI intelligent enough to decide which tools to call, in what order, and how to handle errors gracefully. Unlike a simple prompt→response chatbot, the AI here has to reason, plan, and iterate autonomously.

---

### Q16: How did you handle supporting multiple database types?
**Answer:** I used the **Adapter Pattern**. Each database type (PostgreSQL, MySQL, etc.) has its own adapter class that implements a common interface. This way, the core logic remains the same, and only the database-specific details are handled by adapters.

---

### Q17: What would you improve if you had more time?
**Answer:**
- Add support for more databases like MongoDB.
- Implement write operations with proper safeguards.
- Add voice-based query input.
- Build a mobile application version.

---

## 5. Soft Skills & Learning Questions

### Q18: What did you learn from building this project?
**Answer:**
- Designing and implementing **agentic AI systems**.
- Working with **multiple database connectors** and handling their differences.
- Implementing **rate limiting** and **session management** at scale.
- Building **secure authentication** flows.
- Writing clean, maintainable code across frontend and backend.

---

### Q19: How would you explain this project to a non-technical person?
**Answer:** Imagine you want to ask questions about data stored in a computer, but you need to know a special language called SQL to do that. My project removes that barrier—you can just ask questions in plain English like "Show me all customers from Mumbai," and the system figures out the technical stuff and gives you the answer.

---

### Q20: Why should we consider this project for your candidature?
**Answer:** This project demonstrates:
- **End-to-end development skills** — From frontend UI to backend APIs to database integration.
- **AI/ML understanding** — Implementing agentic AI with tool calling.
- **Problem-solving mindset** — Built this to solve a real problem I faced.
- **Self-initiative** — Completely self-driven project from ideation to execution.
- **Modern tech stack** — Used industry-relevant technologies like React, FastAPI, Firebase, and Redis.

---

## Quick Summary Card

| Aspect | Details |
|--------|---------|
| **Project Name** | Moonlit |
| **Type** | Web-based Agentic AI Platform |
| **Purpose** | Natural language interface for database operations |
| **Frontend** | React, Vite, Material UI |
| **Backend** | Python, FastAPI |
| **AI** | Cerebras LLM with tool calling |
| **Auth** | Firebase |
| **Databases Supported** | PostgreSQL, MySQL, SQLite, Oracle, SQL Server |
| **Unique Feature** | Autonomous AI agent that reasons, plans, and executes database tasks |

---

*Good luck with your Accenture ASE interview!*
