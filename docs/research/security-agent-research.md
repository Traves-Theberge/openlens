# Security Agent Research

Saved from deep research session. See the full findings used to build the security agent prompt.

## Key Sources
- skills.sh/obra/superpowers (structural patterns: iron laws, phase gates, rationalization prevention)
- Semgrep rules (taint analysis patterns)
- CodeQL (interprocedural data flow)
- OWASP Top 10 + API Security Top 10
- GitHub secret-scanning skill

## Summary
- Language-agnostic taint analysis (sources, sinks, sanitizers across all languages)
- 10 OWASP items with grep patterns for any language
- 5 decision trees for ambiguous cases
- 14-item rationalization prevention table
- Evidence requirements for HIGH/MEDIUM/LOW confidence
- 10 common false positive patterns
- Complete investigation protocol using read/grep/glob tools
