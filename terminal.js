const terminal = document.querySelector("#terminal");

function clear() {
	terminal.innerHTML = '';
}

function clear_line() {
	let content = terminal.innerHTML;
	terminal.innerHTML = content.slice(0, content.lastIndexOf("\n")+2);
}

function print(str) {
	terminal.innerHTML += str + '\n';
	window.scrollTo(0,document.body.scrollHeight); // does scrolling still make sense with this implementation?
}

function cprint(str){
	clear();
	terminal.innerHTML += str + '\n';
	window.scrollTo(0,document.body.scrollHeight); // does scrolling still make sense with this implementation?
}

function print_color(c, r, g, b) {
	let entry = "<span style='color:rgb(" + r + "," + g + "," + b + ")'>" + c + "</span>";
	terminal.innerHTML += entry + '\n';
	window.scrollTo(0,document.body.scrollHeight);
}

