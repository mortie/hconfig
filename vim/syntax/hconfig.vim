" Vim syntax file
" Language: HConfig
" Maintainer: Martin Dørum
" Latest Revision: 30 May 2017

if exists("b:current_syntax")
  finish
endif

syn keyword hcnfKeyword true false null
syn match hcnfNumber '\<\([-]\)\=\d*\(\.\d*\)\=\([eE][+-]\=\d*\)\=\>'
syn region hcnfString start='"' end='"'
syn region hcnfString start="'" end="'"
syn match hcnfComment '#.*$'
syn match hcnfSpecial '[\[\]{}]'

let b:current_syntax = "hconfig"
hi def link hcnfKeyword Keyword
hi def link hcnfSpecial Special
hi def link hcnfString String
hi def link hcnfNumber Number
hi def link hcnfComment Comment
