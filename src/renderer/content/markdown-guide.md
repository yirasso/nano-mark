# Markdown, and what it turns into

This file ships inside NanoMark. Nothing here is on your disk, so you cannot
break it — edit anything you like in your own notes instead.

You are reading the **source**. Press `Ctrl+E` to see what it renders to, and
press it again to come back. Reading the two side by side is the whole point:
every block below shows the markup first and the result underneath.

---

## Headings

Hashes, one per level. A space after them is required.

````markdown
# Title
## Section
### Subsection
````

### This is a third-level heading

---

## Emphasis

````markdown
*italic* and _italic_
**bold** and __bold__
***both at once***
~~struck through~~
````

*italic*, **bold**, ***both at once***, ~~struck through~~.

---

## Lists

A dash, a star or a plus starts a bullet. Indent by two spaces to nest.

````markdown
- first
- second
  - nested
  - also nested
- third
````

- first
- second
  - nested
  - also nested
- third

Numbers make an ordered list. The numbers you write do not matter — they are
renumbered — so `1.` on every line is fine.

````markdown
1. first
1. second
1. third
````

1. first
1. second
1. third

Square brackets make a checklist.

````markdown
- [x] done
- [ ] not done
````

- [x] done
- [ ] not done

---

## Code

Backticks around a word keep it as `code` in the middle of a sentence.

````markdown
Run `npm install` before anything else.
````

Three backticks open a block. The word after them names the language, which is
what turns the highlighting on:

`````markdown
```js
const total = items.reduce((sum, item) => sum + item.price, 0)
```
`````

```js
const total = items.reduce((sum, item) => sum + item.price, 0)
```

```bash
curl -s -G 'https://example.com/api/report' \
  --data-urlencode 'from=2026-01-01' \
  --data-urlencode 'format=json' | jq '.rows[]'
```

```python
def slugify(title: str) -> str:
    return "-".join(title.lower().split())
```

Leaving the language off gives you a plain block, with no colours:

```
no language, no highlighting
```

To show backticks *inside* a block — as this file does throughout — fence it
with four backticks instead of three.

---

## Quotes

````markdown
> A quote. It can run over
> several lines.
>
> — and have paragraphs
````

> A quote. It can run over
> several lines.
>
> — and have paragraphs

---

## Links and images

````markdown
[link text](https://example.com)
<https://example.com>
![alt text](./images/diagram.png)
````

A bare URL like <https://example.com> becomes a link on its own. Image paths are
relative to the file, so `./images/diagram.png` means the `images` folder next to
this note.

---

## Tables

Pipes make the columns. The second row sets the alignment: `:---` left, `---:`
right, `:---:` centred. The pipes do not have to line up.

````markdown
| Command      | What it does        | Keys |
| :----------- | :------------------ | ---: |
| New file     | writes it to disk   |    ⌘N |
| Preview      | renders the file    |    ⌘E |
````

| Command      | What it does        | Keys |
| :----------- | :------------------ | ---: |
| New file     | writes it to disk   |    ⌘N |
| Preview      | renders the file    |    ⌘E |

---

## Breaks

A blank line starts a new paragraph. Three dashes on their own line draw a rule.

Two spaces at the end of a line force a line break without a new paragraph —
which is why you sometimes get one you did not ask for.

---

## When markdown is not enough

Plain HTML passes straight through, so <kbd>Ctrl</kbd> and <sub>subscript</sub>
work when there is no markdown for what you want.

To write a character markdown would otherwise eat, put a backslash in front of
it: \*not italic\*, \# not a heading.
