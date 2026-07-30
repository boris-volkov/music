const PI = 3.1415 // switch to Math.PI wherever it is used

function light_key(key){
    key = key.mod(12);
    document.getElementById(key.toString()).classList.add('pressed');
}

function green_key(key){
    key = key.mod(12);
    document.getElementById(key.toString()).classList.add('correct');
}

function unlight_key(key){
    key = key.mod(12);
    const el = document.getElementById(key.toString());
    el.classList.remove('pressed');
    el.classList.remove('correct');
}