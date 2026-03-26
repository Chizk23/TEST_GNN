---
name: Premium UI/UX Design System
description: Best practices for implementing stunning, modern web designs with glassmorphism and smooth animations.
---

# Premium UI/UX Skill

This skill guides the creation of visually exceptional web applications that "WOW" the user.

## Design Principles

1. **Color Palette**: Use rich, harmonious HSL-based colors. Avoid flat primary colors. Use deep dark modes with subtle contrast.
2. **Typography**: Use Google Fonts like `Inter`, `Outfit`, or `Roboto`. Never use browser defaults.
3. **Glassmorphism**: Use `backdrop-filter: blur(10px)` and semi-transparent backgrounds (`rgba(255, 255, 255, 0.1)`) for card elements.
4. **Animations**: 
    - Use subtle hover effects (`transform: translateY(-5px)`).
    - Implement fade-in animations for page load.
    - Use micro-interactions for buttons.
5. **Layout**: Prioritize whitespace and clean spacing. Use CSS Grid and Flexbox for responsive, premium layouts.

## Standard Premium CSS Template

```css
:root {
    --primary: #6366f1;
    --secondary: #a855f7;
    --background: #0f172a;
    --card-bg: rgba(30, 41, 59, 0.7);
    --text: #f8fafc;
    --glass-border: rgba(255, 255, 255, 0.1);
}

body {
    font-family: 'Outfit', sans-serif;
    background: radial-gradient(circle at top right, #1e1b4b, var(--background));
    color: var(--text);
}

.glass-card {
    background: var(--card-bg);
    backdrop-filter: blur(12px);
    border: 1px solid var(--glass-border);
    border-radius: 20px;
    padding: 2rem;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
}
```
