const toggleButton = document.getElementById('options_toggle');
const contentDiv = document.getElementById('choices');

toggleButton.addEventListener('click', () => {
    contentDiv.style.display = contentDiv.style.display === 'none' ? 'flex' : 'none';
});



// this next code can check and change the color properties of the page
// const colorButton = document.getElementById('color_button')
// colorButton.addEventListener('click', () => {
//     document.documentElement.style.setProperty('--bg_color', '#321');
//     console.log(document.documentElement.style.getPropertyValue('--bg_color'));
// });



const fullscreenBtn = document.getElementById('full_screen');

fullscreenBtn.addEventListener('click', toggleFullscreen);

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
