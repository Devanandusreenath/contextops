# AI-assistance disclosure (template: complete honestly before submitting)

> The Graph Hacks rules ask participants to disclose AI coding assistance. This is a **template**. The repository was scaffolded with
> an AI assistant; only *you* know what you reviewed, changed and wrote yourself. Edit every bracket and delete what does not apply.

## Tools used
- [x] AI assistant used to generate the initial backend and frontend integration: **Claude (Anthropic)**: confirm the exact model/tool: `[ ]`
- [ ] Other tools (Copilot, ChatGPT, …): `[ ]`

## What the AI generated
Per the generation session: the FastAPI backend, FalkorDB graph model and seed data, Cypher queries, the two-agent workflow, deterministic
test fixtures, the Docker Compose configuration, the frontend API integration and the documentation in this repository.

## What I (the participant) did   `[complete]`
- [ ] I read and understood the graph model (`docs/graph-model.md`) and can explain each Cypher query (`docs/cypher-queries.md`).
- [ ] I ran the application and tests myself on my machine (date: `[ ]`; OS: `[ ]`).
- [ ] Changes I made to AI-generated code: `[ ]`
- [ ] Parts I wrote myself: `[ ]`
- [ ] Parts I did not review in depth: `[ ]`

## Data and models
- All data is synthetic and fictional; no personal, restricted or paywalled data is used.
- LLM at runtime: optional. With no `OPENAI_API_KEY` the app uses deterministic rules (the UI says so). Provider/model if you enable it: `[ ]`.

## Honest status notes (from the generation session)
See `docs/test-report.md` for exactly which tests were executed in the build environment and which were not (Docker Compose and a real
LLM provider were not available there).
