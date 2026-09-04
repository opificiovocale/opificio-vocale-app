"""Extract newsletter text without scripts, hidden previews or email footers."""
from html.parser import HTMLParser
import re
import sys

class NewsletterParser(HTMLParser):
    blocks = {'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article', 'tr', 'td', 'table'}
    voids = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.parts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        parent_hidden = self.stack[-1][1] if self.stack else False
        style = re.sub(r'\s+', '', attrs.get('style', '').lower())
        classes = attrs.get('class', '').lower()
        hidden = parent_hidden or tag in {'head', 'script', 'style', 'svg', 'noscript', 'footer'} or 'hidden' in attrs or 'display:none' in style or 'visibility:hidden' in style or 'ml-footer' in classes or 'preheader' in classes
        if not hidden:
            if tag in self.blocks or tag == 'hr': self.parts.append('\n\n')
            elif tag == 'br': self.parts.append('\n')
        if tag not in self.voids: self.stack.append((tag, hidden))

    def handle_endtag(self, tag):
        matching = next((i for i in range(len(self.stack) - 1, -1, -1) if self.stack[i][0] == tag), None)
        if matching is None: return
        hidden = self.stack[matching][1]
        del self.stack[matching:]
        if not hidden and tag in self.blocks: self.parts.append('\n\n')

    def handle_data(self, data):
        if not self.stack or not self.stack[-1][1]: self.parts.append(re.sub(r'\s+', ' ', data))

    def text(self):
        lines = [line.strip() for line in ''.join(self.parts).splitlines()]
        return re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()

if __name__ == '__main__':
    parser = NewsletterParser()
    parser.feed(sys.stdin.read())
    print(parser.text())
