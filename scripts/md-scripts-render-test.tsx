import React from 'react'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from '../src/components/Markdown'

const html = renderToStaticMarkup(
  <Markdown content={'| Metric | Value |\n| --- | --- |\n| σ~w~ | x^2^ |\n\n~~removed~~ H<sub>2</sub>O\n\n`σ~w~`'} />,
)

assert.match(html, /<sub>w<\/sub>/)
assert.match(html, /<sup>2<\/sup>/)
assert.match(html, /<sub>2<\/sub>/)
assert.match(html, /<del[^>]*>removed<\/del>/)
assert.match(html, /<code[^>]*>σ~w~<\/code>/)
console.log('PASS: table scripts, HTML compatibility, strikethrough and literal code render')
