---
name: Secure DevOps & CI/CD
description: Security best practices and automation scripts for production-ready AI apps.
---

# Secure DevOps Skill

Ensures the application is secure, maintainable, and automatically deployable.

## Security Practices

1. **Secret Management**: Never hardcode API keys. Use `.env` files and `os.getenv()`.
2. **Dependency Auditing**: Regularly run `pip-audit` or `npm audit`.
3. **Input Validation**: Sanitize all user inputs in Streamlit to prevent injection or CSS attacks.
4. **Least Privilege**: Configure Docker containers and Cloud IAM with minimal required permissions.

## CI/CD Template (GitHub Actions)

```yaml
name: CI/CD Pipeline
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'
      - name: Install dependencies
        run: pip install -r requirements.txt
      - name: Run Tests
        run: pytest
      - name: Security Check
        run: pip-audit
```
