var fs = require("fs");
var pathlib = require("path");

exports.parseFile = parseFile;
exports.parseString = parseString;
exports.parseConfFile = parseConfFile;
exports.parseConfString = parseConfString;

class Enum {
	constructor(...vals) {
		var i = 1;
		this._strs = [];
		vals.forEach(j => {
			this[j] = i;
			this._strs[i] = j;
			i += 1;
		});
	}

	match(val, obj) {
		var res = obj[this.str(val)];
		return res;
	}

	str(val) {
		return this._strs[val];
	}
}

var TokenTypes = new Enum(
	"STRING",
	"NUMBER",
	"BOOL",
	"NULL",
	"EOF",
	"OPENBRACKET",
	"CLOSEBRACKET",
	"OPENBRACE",
	"CLOSEBRACE",
	"UNKNOWN");

function makeToken(type, linenr, content) {
	if (content == null) {
		content = TokenTypes.match(type, {
			STRING: "[string]",
			NUMBER: "[number]",
			BOOL: "[bool]",
			NULL: "[null]",
			EOF: "[eof]",
			OPENBRACKET: "[",
			CLOSEBRACKET: "]",
			OPENBRACE: "{",
			CLOSEBRACE: "}",
			UNKNOWN: "[unknown]",
		});
	}
	return { type, linenr, content };
}

function isspace(ch) {
	return ch == ' ' || ch == '\r' || ch == '\t' || ch == '\n' || ch == null;
}

class TokenStream {
	constructor() {
		this.linenr = 1;
		this.prevChar = null;
		this.currChar = null;
		this.nextChar = null;

		this.currToken = null;
	}

	init() {
		this.readChar();
		this.readToken();
	}

	_nextChar() {
		throw new Error("_nextChar is not implemented.");
	}

	readChar() {
		var c = this._nextChar();
		this.prevChar = this.currChar;
		this.currChar = this.nextChar;
		this.nextChar = c;

		if (this.prevChar == "\n")
			this.linenr += 1;
	}

	_nextToken() {
		this.readChar();
		var curr = this.currChar;
		var next = this.nextChar;

		var content = "";

		// EOF
		if (curr == null)
			return makeToken(TokenTypes.EOF, this.linenr);

		// [
		else if (curr == '[')
			return makeToken(TokenTypes.OPENBRACKET, this.linenr);

		// ]
		else if (curr == ']')
			return makeToken(TokenTypes.CLOSEBRACKET, this.linenr);

		// {
		else if (curr == '{')
			return makeToken(TokenTypes.OPENBRACE, this.linenr);

		// }
		else if (curr == '}')
			return makeToken(TokenTypes.CLOSEBRACE, this.linenr);

		// comments
		if (curr == '#') {
			while (this.nextChar != '\n' && this.nextChar != null)
				this.readChar();

			return this._nextToken();
		}

		// whitespace
		if (isspace(curr)) {
			while (isspace(this.nextChar) && this.nextChar != null)
				this.readChar();

			return this._nextToken();
		}

		// number
		else if (
				(next >= '0' && next <= '9' && curr == '-') ||
				(curr >= '0' && curr <= '9')) {

			var containsDot = false;
			var containsExp = false;
			var cont = () => {

				// Disallow null (i.e EOF)
				if (this.nextChar == null)
					return false;

				// Allow numbers
				if (this.nextChar >= '0' && this.nextChar <= '9')
					return true;

				// Allow dots only once
				if (!containsDot && this.nextChar == '.') {
					containsDot = true;
					return true;
				}

				// Allow exponents
				if (
						!containsExp &&
						(this.nextChar == 'e' || this.nextChar == 'E')) {
					containsExp = true;
					return true;
				}

				// Allow + and - in exponents
				if (
						(this.nextChar == '-' || this.nextChar == '+') &&
						(this.currChar == 'e' || this.currChar == 'E'))  {
					return true;
				}

				return false;
			};

			content += curr;
			while (cont()) {
				content += this.nextChar;
				this.readChar()
			}

			return makeToken(TokenTypes.NUMBER, this.linenr, content);
		}

		// string
		else if (curr == '"') {
			this.readChar();
			while (this.currChar != '"') {
				content += this.currChar;
				this.readChar();
			}

			return makeToken(TokenTypes.STRING, this.linenr, content);
		}

		// string without quotes, or bool
		else {
			content += this.currChar;
			cont = () => (
				!isspace(this.nextChar) &&
				this.nextChar != ']' &&
				this.nextChar != '}');
			while (cont()) {
				content += this.nextChar;
				this.readChar();
			}

			if (content === "true")
				return makeToken(TokenTypes.BOOL, this.linenr, true);
			else if (content === "false")
				return makeToken(TokenTypes.BOOL, this.linenr, false);
			else if (content === "null")
				return makeToken(TokenTypes.NULL, this.linenr);
			else
				return makeToken(TokenTypes.STRING, this.linenr, content);
		}
	}

	warn(token, msg) {
		console.error(
			this.file+":"+token.linenr+": "+msg);
	}

	err(token, msg) {
		var err = new Error(
			this.file+":"+token.linenr+": "+msg);
		err.rcParseError = true;
		throw err;
	}

	readToken() {
		this.currToken = this._nextToken();
	}

	expect(type) {
		var t = this.currToken;
		if (t.type !== type)
			this.err(
				t,
				"Expected "+TokenTypes.str(type)+", got "+
				TokenTypes.str(t.type));

		this.readToken();
		return t;
	}
}

class FileTokenStream extends TokenStream {
	constructor(file) {
		super();
		this.file = file;
		this.fd = fs.openSync(file, "r");
		this.init();
	}

	_nextChar() {
		var buf = Buffer.alloc(1);
		var cnt = fs.readSync(this.fd, buf, 0, 1);
		if (cnt === 0)
			return null;
		else
			return String.fromCharCode(buf[0]);
	}
}

class StringTokenStream extends TokenStream {
	constructor(str) {
		super();
		this.str = str;
		this.index = 0;
		this.init();
	}

	_nextChar() {
		if (this.str.length <= this.index)
			return null;
		else
			return this.str[this.index++];
	}
}

class Parser {
	constructor(stream, sections, data) {
		this.stream = stream;

		this.sections = sections;
		this.data = data || {};
	}

	parseSections() {
		var stream = this.stream;

		while (stream.currToken.type !== TokenTypes.EOF) {
			if (
					(stream.currToken.type === TokenTypes.STRING) &&
					(stream.currToken.content === "include"))
				this.include();
			else
				this.parseSection();
		}
	}

	include() {
		var stream = this.stream;

		// 'include'
		stream.expect(TokenTypes.STRING);

		// <file>
		var file = stream.expect(TokenTypes.STRING);

		var path;
		if (this.stream instanceof FileTokenStream) {
			var dirname = pathlib.dirname(this.stream.file);
			path = pathlib.join(dirname, file.content);
		} else {
			path = file.content;
		}

		if (pathlib.normalize(stream.file) === pathlib.normalize(path))
			stream.err(file, "Attempted to include self");

		var stream;
		try {
			stream = new FileTokenStream(path);
		} catch (err) {
			stream.warn(file, err.toString());
		}

		var parser = new Parser(stream, this.sections, this.data);
		parser.parse();
	}

	parseSection() {
		var stream = this.stream;

		// <section>
		var section = stream.expect(TokenTypes.STRING);
		if (
				(this.sections != null) &&
				(this.sections.indexOf(section.content) === -1)) {
			stream.err(section, "Unknown section name: "+section.content);
		}

		// [name property]
		var sub = null;
		if (stream.currToken.type === TokenTypes.STRING)
			sub = stream.expect(TokenTypes.STRING).content;

		// <object>
		var obj = this.parseObject();

		obj.name = sub;

		if (this.data[section.content] == null)
			this.data[section.content] = [];
		this.data[section.content].push(obj);
	}

	parseArray() {
		var stream = this.stream;

		// '['
		stream.expect(TokenTypes.OPENBRACKET);

		// values
		var arr = [];
		while (stream.currToken.type !== TokenTypes.CLOSEBRACKET) {
			arr.push(this.parseValue());
		}

		// ']'
		stream.expect(TokenTypes.CLOSEBRACKET);
		return arr;
	}

	parseObject(ignoreBraces) {
		var stream = this.stream;

		// '{'
		if (!ignoreBraces)
			stream.expect(TokenTypes.OPENBRACE);

		// [values]
		var obj = {};
		while (
				stream.currToken.type !== TokenTypes.CLOSEBRACE &&
				stream.currToken.type !== TokenTypes.EOF) {
			var key = stream.expect(TokenTypes.STRING);
			var val = this.parseValue();
			obj[key.content] = val;
		}

		// '}'
		if (!ignoreBraces)
			stream.expect(TokenTypes.CLOSEBRACE);
		return obj;
	}

	parseValue() {
		var stream = this.stream;

		if (stream.currToken.type === TokenTypes.BOOL)
			return stream.expect(TokenTypes.BOOL).content;
		if (stream.currToken.type === TokenTypes.NULL)
			return null;
		if (stream.currToken.type === TokenTypes.STRING)
			return stream.expect(TokenTypes.STRING).content;
		if (stream.currToken.type === TokenTypes.NUMBER)
			return parseFloat(stream.expect(TokenTypes.NUMBER).content);
		if (stream.currToken.type === TokenTypes.OPENBRACKET)
			return this.parseArray();
		if (stream.currToken.type === TokenTypes.OPENBRACE)
			return this.parseObject();

		stream.err(
			stream.currToken,
			"Unexpected token "+TokenTypes.str(stream.currToken.type));
	}
}

function parseFile(file, includeRoot) {
	var stream = new FileTokenStream(file);
	var parser = new Parser(stream);
	if (includeRoot)
		return parser.parseValue();
	else
		return parser.parseObject(true /* ignoreBraces */);
}

function parseString(str, includeRoot) {
	var stream = new StringTokenStream(str);
	var parser = new Parser(stream);
	if (includeRoot)
		return parser.parseValue();
	else
		return parser.parseObject(true /* ignoreBraces */);
}

function parseConfFile(file, sections) {
	var stream = new FileTokenStream(file);
	var parser = new Parser(stream);
	parser.parseSections();
	return parser.data;
}

function parseConfString(str, sections) {
	var stream = new StringTokenStream(str);
	var parser = new Parser(stream);
	parser.parseSections();
	return parser.data;
}
