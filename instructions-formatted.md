# Agent Instructions — WeMadeAGame Project

## Purpose

This document provides structured directives for AI agents working on the WeMadeAGame
project. All tasks must be executed in the order listed below. Tasks with no dependencies
on one another may be executed in parallel to improve efficiency.

---

## Ordered Task List

1. **Format the Instructions Document**

   Copy this document and reformat it for grammar and spelling correctness. Generate
   properly structured paragraphs and ordered lists that are optimized for agent
   consumption.

2. **Create the Games Website**

   Generate a website structured to test various gaming concepts. Implement a
   multi-directory website accessible via GitHub Pages, rooted at the `/games` directory.
   The first game to implement is a casino slots game that has already been initiated
   using Claude Code.

3. **Maintain Repository Cleanliness**

   Ensure a clean and uncluttered repository state persists at all times. Delete any
   unnecessary file copies or forks.

4. **Create the Overview Page**

   Create a separate page accessible through the games website navigation menu. This
   page must include:

   - An overview of each gaming test and its current status
   - A method for the owner to post comments by using `#` hashtags
   - A list titled **Human Requirements** containing all actions that require a human to
     complete
   - A checkbox for each Human Requirements item, allowing the owner to track and
     communicate the completion status of each item

5. **Apply Meta Tags to All Elements**

   Assign a meta tag to every significant element. Maintain a glossary or index of all
   tagged elements. Each glossary entry must include structured comments that answer
   the following questions:

   - **What** is this element?
   - **Why** does it exist?
   - **How** does it function?
   - **When** is it used?
   - **Where** is it located?

6. **Document Custom Media Requirements**

   For any element that requires custom media (images, audio, video, icons, etc.),
   include it in the Human Requirements list. For each media item, specify:

   - Exact required dimensions
   - Required meta tags
   - Any additional formatting or encoding specifications

---

## Notes for Agents

- Treat each numbered item as an atomic unit of work with its own deliverable.
- Persist any user-facing state (e.g., comments, checkbox status) using `localStorage`
  unless a backend is available.
- Use `data-meta` attributes on HTML elements to implement element-level meta tagging.
- The glossary must be maintained as a living document and updated whenever new
  elements are added.
- All pages must include standard HTML `<meta>` tags (charset, viewport, description,
  keywords, author) in the `<head>` section.
