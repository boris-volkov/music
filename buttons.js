
const fullscreenBtn = document.getElementById('full_screen');

fullscreenBtn.addEventListener('pointerdown', toggleFullscreen);

function toggleFullscreen() {
  if (document.fullscreenElement) {
    // Exit fullscreen
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.mozCancelFullScreen) { // Firefox
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) { // Chrome, Safari, Opera
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) { // Internet Explorer
      document.msExitFullscreen();
    }
  } else {
    // Enter fullscreen
    const element = document.documentElement;
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.mozRequestFullScreen) { // Firefox
      element.mozRequestFullScreen();
    } else if (element.webkitRequestFullscreen) { // Chrome, Safari, Opera
      element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) { // Internet Explorer
      element.msRequestFullscreen();
    }
  }
}


const toggleButton = document.getElementById('options_toggle');
const contentDiv = document.getElementById('choices');
let prev_canvas_display;

function optionsOn(){
    toggleButton.classList.add("active");
    contentDiv.style.display = 'flex';
}

function optionsOff(){
    toggleButton.classList.remove("active");
    contentDiv.style.display = 'none';
    terminal.style.display = 'block';
}

toggleButton.addEventListener('pointerdown', () => {
    if (contentDiv.style.display === 'none'){
        contentDiv.style.display = 'flex';
        terminal.style.display = 'none';
        prev_canvas_display = canvas.style.display;
        canvas.style.display = 'none';
    } else {
        contentDiv.style.display = 'none';
        terminal.style.display = 'block';
        canvas.style.display = prev_canvas_display;
    }
    toggleButton.classList.toggle("active");
});

// this next code can check and change the color properties of the page
// const colorButton = document.getElementById('color_button')
// colorButton.addEventListener('pointerdown', () => {
//     document.documentElement.style.setProperty('--bg_color', '#321');
//     console.log(document.documentElement.style.getPropertyValue('--bg_color'));
// });
