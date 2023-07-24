const PI = 3.1415 // switch to Math.PI wherever it is used

function light_key(key){
    key = key.mod(12);
    document.getElementById(key.toString()).style.backgroundColor = '#F7EF78';
}

function green_key(key){
    key = key.mod(12);
    document.getElementById(key.toString()).style.backgroundColor = '#3F6';
}

function unlight_key(key){
    key = key.mod(12);
    document.getElementById(key.toString()).style.backgroundColor = null;
}