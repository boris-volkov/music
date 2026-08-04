
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


// Options live in panels opened from the menu bar, one at a time. They sit above the
// practice area rather than replacing it, so the keyboard and prompt stay visible while
// settings are being changed.

const menu_tabs = [...document.querySelectorAll('.menu_tab')];

function open_options_panel(id) {
    menu_tabs.forEach((tab) => {
        const isTarget = tab.dataset.panel === id;
        tab.classList.toggle('active', isTarget);
        document.getElementById(tab.dataset.panel).style.display = isTarget ? 'flex' : 'none';
    });
}

function optionsOff() {
    open_options_panel(null); // no panel matches, so they all close
}

// Kept for theory.js, which pops the note pickers open when a game has nothing selected
function optionsOn() {
    open_options_panel('panel_practice');
}

menu_tabs.forEach((tab) => {
    tab.addEventListener('pointerdown', () => {
        const alreadyOpen = tab.classList.contains('active');
        open_options_panel(alreadyOpen ? null : tab.dataset.panel);
    });
});

// Each activity only cares about some of the note pickers -- a chord quiz has no use for
// the interval list. Showing only what applies keeps the panel from becoming a wall.
function set_relevant_options(sections) {
    let anyShown = false;
    document.querySelectorAll('#panel_practice .choice_holder').forEach((holder) => {
        const relevant = sections.includes(holder.dataset.section);
        holder.style.display = relevant ? 'flex' : 'none';
        if (relevant) anyShown = true;
    });

    document.getElementById('practice_empty_note').style.display = anyShown ? 'none' : 'block';
    const practiceTab = menu_tabs.find((t) => t.dataset.panel === 'panel_practice');
    practiceTab.disabled = !anyShown;
    if (!anyShown && practiceTab.classList.contains('active')) optionsOff();
}
