// Vesuvius 1944 archive: newsreels, photographs and eyewitness accounts, shared by
// vesuvius-1944-lava.html and vesuvius-1944-eruption-3d.html.
// Archive version 1.5. 1.5: holds the eight story moments (text, evidence, questions, teacher notes) shared by the 3D and VR stories. 1.4: exposes the content as VesuviusArchive.data for the story page; US spelling. 1.3: works in the VR page (card on screen, momentAt() for the headset panel), version labels filled in automatically. 1.2: B-25 photo restored, licence confirmed as USGOV-PD. 1.1: B-25 photo removed pending licence check. Bump ARCHIVE_VERSION whenever the content or behaviour changes.
//
// Usage: VesuviusArchive.mount({ panel: element, page: "lava" | "3d" | "vr", mapwrap: element })
//        VesuviusArchive.atHour(h, active)   // 3D and VR pages: h = hours from 00:00, 18 March 1944
//        VesuviusArchive.momentAt(h, active) // plain-text account for the VR headset panel, or null
// Any element with class "va-ver" gets the archive version written into it.
(function () {
  "use strict";
  const ARCHIVE_VERSION = "1.5";

  // ---------- Content ----------
  const SMU = "Melvin C. Shaffer, US Army. DeGolyer Library, Southern Methodist University (no known copyright restrictions)";
  const FLICKR = "https://www.flickr.com/photos/smu_cul_digitalcollections/";
  const PHOTOS = [
    { id: "sansebnight", src: "https://live.staticflickr.com/3531/3987076267_9a85eb8027_z.jpg", page: FLICKR + "3987076267/",
      title: "Lava flows into San Sebastiano al Vesuvio at night", date: "March 1944", credit: SMU,
      look: "The glow is the hot inside of the flow. The dark edges are lava that has already cooled into a crust. How fast do you think it is moving?" },
    { id: "front", src: "https://live.staticflickr.com/3475/3987098207_e3f4cf098b_z.jpg", page: FLICKR + "3987098207/",
      title: "The front of the lava flow, with the eruption behind", date: "March 1944", credit: SMU,
      look: "The front is a steep wall of broken, blocky lava, not a runny river. An American doctor called it “a huge mass of fiery coals”." },
    { id: "west", src: "https://live.staticflickr.com/2467/3987821090_b433cc5e93_z.jpg", page: FLICKR + "3987821090/",
      title: "Lava flow engulfing a village to the west of Vesuvius", date: "1944", credit: SMU,
      look: "Find San Sebastiano and Massa di Somma on the map. They are north-west of the cone. Which way did this lava have to turn to get there?" },
    { id: "sanseb", src: "https://live.staticflickr.com/2426/3987768750_bcdb62de28_z.jpg", page: FLICKR + "3987768750/",
      title: "The eruption at San Sebastiano al Vesuvio", date: "1944", credit: SMU,
      look: "Lava moved slowly enough for people to leave, but it destroyed almost every building it reached." },
    { id: "church", src: "https://live.staticflickr.com/2499/3987145623_99e7ecd7a1_z.jpg", page: FLICKR + "3987145623/",
      title: "Church destroyed by lava, San Sebastiano al Vesuvio", date: "March 1944", credit: SMU,
      look: "Lava pushes walls over and buries what is left. Compare this with the buildings count in the model." },
    { id: "churchin", src: "https://live.staticflickr.com/2562/3987946178_a6d83f3b57_z.jpg", page: FLICKR + "3987946178/",
      title: "Inside the church destroyed by lava, San Sebastiano", date: "1944", credit: SMU,
      look: "How high did the lava reach inside the building? Use the people or doorways for scale." },
    { id: "children", src: "https://live.staticflickr.com/3524/3987052447_e85eafa0a8_z.jpg", page: FLICKR + "3987052447/",
      title: "Vesuvius, and children whose homes were covered by the lava", date: "1944", credit: SMU,
      look: "About 10,000–12,000 people lost their homes. What would a family need straight after an eruption like this?" },
    { id: "naples", src: "https://live.staticflickr.com/3471/3987122833_fb1b5f5d9a_z.jpg", page: FLICKR + "3987122833/",
      title: "The eruption seen from Naples", date: "1944", credit: SMU,
      look: "Naples is about 12 km from the crater. The lava never got there, but the eruption column could be seen from everywhere in the city." },
    { id: "height", src: "https://live.staticflickr.com/2597/3987153387_f8a3670e7b_z.jpg", page: FLICKR + "3987153387/",
      title: "Naples at the height of the eruption", date: "1944", credit: SMU,
      look: "This is the explosive phase: a column of ash several kilometres high. Which way is the wind blowing it?" },
    { id: "night", src: "https://live.staticflickr.com/2650/3987029415_3fc6fe360d_z.jpg", page: FLICKR + "3987029415/",
      title: "Vesuvius at night", date: "March 1944", credit: SMU,
      look: "At night the glowing lava and fountains were visible for tens of kilometres." },
    { id: "b25", src: "https://commons.wikimedia.org/wiki/Special:FilePath/North_American_B-25_after_1944_Mount_Versuvius_eruption_at_Pompeii_Airfield.jpg?width=800",
      page: "https://commons.wikimedia.org/wiki/File:North_American_B-25_after_1944_Mount_Versuvius_eruption_at_Pompeii_Airfield.jpg",
      title: "A B-25C bomber of the 321st Bomb Group, damaged by the ash fall at Pompeii Airfield", date: "March 1944",
      credit: "US Army Air Forces photograph. Public domain (work of the US federal government), via Wikimedia Commons",
      look: "The lava never came this way. Ash and cinders did, carried east by the wind. Why can ash reach places that lava can’t?" },
    { id: "couple", src: "https://live.staticflickr.com/2582/3987952640_9437053ae4_z.jpg", page: FLICKR + "3987952640/",
      title: "A couple watching Vesuvius from Naples", date: "Spring 1944", credit: SMU,
      look: "Millions of people live around Vesuvius today. Why do people choose to live next to an active volcano?" }
  ];
  const P = Object.fromEntries(PHOTOS.map(p => [p.id, p]));

  // h = hours from 00:00 on 18 March 1944, for the 3D timeline. null = not on the timeline.
  const VOICES = [
    { h: 20, who: "Dr Leander K. Powers", role: "US Army flight surgeon, 340th Bomb Group, based near Pompei", when: "Diary, 18 March 1944",
      quote: "Streams of fire were shooting thousands of feet into the air, and the countryside was lit up for miles around.",
      src: "https://alcpress.org/kaiser/489thbs/vesuvius/", srcName: "Don Kaiser, 489th Bomb Squadron history", photo: "night" },
    { h: 42, who: "Dr Leander K. Powers", role: "US Army flight surgeon", when: "Diary, 19 March 1944",
      quote: "A huge mass of fiery coals some 20 feet high and 200 yards wide destroying everything in its path.",
      src: "https://alcpress.org/kaiser/489thbs/vesuvius/", srcName: "Don Kaiser, 489th Bomb Squadron history", photo: "front",
      think: "20 feet is about 6 m and 200 yards is about 180 m. Compare that with the model's Flow width setting." },
    { h: 50, who: "Norman Lewis", role: "British Army intelligence officer in Naples", when: "Diary, March 1944, published in Naples ’44 (1978)",
      quote: "It was the most majestic and terrible sight I have ever seen …",
      src: "https://www.travelbooks.co.uk/norman-lewis-1/2017/5/24norman-lewis-on-naples", srcName: "Norman Lewis, Naples ’44 (short extract)", photo: "naples",
      think: "“Majestic” and “terrible” at the same time. Why might someone feel both?" },
    { h: 64, who: "Joseph P. Gomer", role: "Fighter pilot, 332nd Fighter Group (the Tuskegee Airmen)", when: "Recalled later, about March 1944",
      quote: "I could see all that red lava just flowing down. A beautiful sight.",
      src: "https://alcpress.org/kaiser/489thbs/vesuvius/", srcName: "Don Kaiser, 489th Bomb Squadron history", photo: "west",
      think: "He saw it from the air. How would the same lava look to a family in San Sebastiano?" },
    { h: 76, photoOnly: true, photo: "sansebnight", when: "Early on 21 March 1944",
      caption: "The lava reaches San Sebastiano al Vesuvio. Allied troops had already helped thousands of people to leave." },
    { h: 114, who: "Dr Leander K. Powers", role: "US Army flight surgeon", when: "Diary, 22 March 1944",
      quote: "I learned from an Allied Military Government officer that 78 planes (B-25) were destroyed on the Pompeii airfield.",
      src: "https://alcpress.org/kaiser/489thbs/vesuvius/", srcName: "Don Kaiser, 489th Bomb Squadron history", photo: "b25",
      think: "Estimates range from 78 to 88 aircraft. Why might eyewitnesses give different numbers?" },
    { h: 120, who: "1st Lt Dana Craig", role: "486th Bomb Squadron, 340th Bomb Group", when: "Around midnight, 22–23 March 1944",
      quote: "While outside, in a mild drizzle, I was hit on the head by what I thought was a small rock … the light revealed a layer of damp cinders on the ground.",
      src: "https://alcpress.org/kaiser/489thbs/vesuvius/", srcName: "Don Kaiser, 489th Bomb Squadron history", photo: "b25",
      think: "The airfield was about 7 km east of the crater, and no lava went that way. What carried the cinders there?" },
    { h: 126, photoOnly: true, photo: "height", when: "22–23 March 1944",
      caption: "The explosive phase, seen from Naples. Ash piled up on roofs to the east until some collapsed." },
    { h: null, who: "Giuseppe Imbò", role: "Director of the Vesuvius Observatory", when: "Throughout the eruption",
      para: "Imbò stayed at the observatory on the volcano’s slope for the whole eruption and kept a detailed scientific record. EARTH Magazine reports that he crawled in the dark to the edge of the lava to take measurements. His record is why scientists can divide the eruption into four phases: lava flows, lava fountains, explosions, and smaller explosions with earthquakes.",
      src: "https://www.earthmagazine.org/article/benchmarks-march-17-1944-most-recent-eruption-mount-vesuvius/", srcName: "EARTH Magazine, 2016" }
  ];

  const FILMS = [
    { title: "Vesuvius Eruption (1944)", by: "British Pathé newsreel", embed: "https://www.youtube-nocookie.com/embed/A-P6qQfc5fw?rel=0",
      page: "https://www.youtube.com/watch?v=A-P6qQfc5fw",
      about: "Shown in British cinemas in spring 1944. Pathé’s catalogue describes the eruption from the air, lava moving down the slopes, people leaving Cercola, and lava moving through the streets of San Sebastiano.",
      watch: ["How fast does the lava front move? Does it look like a river or a moving pile of rubble?",
              "What are people carrying as they leave? What does that tell you about how much warning they had?",
              "This film was made for wartime audiences in Britain. Whose voices are missing?"] },
    { title: "Eruption of Mount Vesuvius, 1944", by: "Castle Films newsreel (about 10 minutes, via Periscope Film)", embed: "https://archive.org/embed/72052fVesuviusErupts",
      page: "https://archive.org/details/72052fVesuviusErupts",
      about: "A longer American newsreel. It shows the eruption from Naples and close up, and the damage to US Army Air Forces bombers at Pompeii Airfield.",
      watch: ["Pause when you see the aircraft. What is covering them, and how did it get there?",
              "List every hazard you can see: lava, ash, falling rocks, gas. Which one does the model in this app show?"] }
  ];

  const ACTIVITIES = [
    { t: "Test the model against an eyewitness", b: "Dr Powers described the lava front as “20 feet high and 200 yards wide” (about 6 m and 180 m). Set <b>Flow width</b> to 180 m and run the model with the 1944 northern flow. Does the most likely path reach San Sebastiano, where the photos were taken?" },
    { t: "Was there time to escape?", b: "The lava moved at 50–300 m an hour and San Sebastiano is about 5 km from the crater. Work out the fastest and slowest time the lava could take to get there. Then look at the photo of the children. Why did few people die from the lava?" },
    { t: "Which hazard went furthest?", b: "Lava traveled about 5 km, and only where the ground led it downhill, toward San Sebastiano. Ash went wherever the wind blew it. It fell on Pompeii Airfield, about 7 km east of the crater, wrecking 78–88 bombers, and on towns more than 20 km away, such as Cava. About 26 people died, most when ash piled up on roofs until they collapsed. Which hazard is harder to plan for, and why?" },
    { t: "Same eruption, different views", b: "A pilot called it “a beautiful sight”. An intelligence officer called it “majestic and terrible”. Choose two eyewitnesses. How did where they were, and who they were, change what they noticed?" },
    { t: "Read the newsreel like a historian", b: "A newsreel is a primary source, but it was edited to tell a story for cinema audiences. What did the filmmakers choose to show? What might they have left out? The people of San Sebastiano and Massa di Somma are seen but not heard." }
  ];

  // The eight moments of the guided story (used by vesuvius-1944-story.html and the VR story).
  // h0-h1: hours from 00:00 on 18 March 1944; dur: seconds of playback; ev: evidence by photo id / voice index.
  const STORY = [
    { h0: 0, h1: 0, dur: 0,
      when: "Before the eruption", title: "A volcano next to a city",
      text: "Mount Vesuvius rises above the Bay of Naples in southern Italy. In March 1944, during World War II, Allied soldiers were based all around it, and thousands of families lived on its slopes. This is the story of its last eruption, told with a computer model, photographs and the words of people who were there.",
      ev: { photo: "couple" },
      q: "Find the towns on the map. Which ones do you think are most at risk from lava? Why?",
      note: "Any reasoned answer. Students often pick the closest towns; the story shows that the shape of the land decides where lava goes." },
    { h0: 16.5, h1: 42, dur: 16,
      when: "18 March 1944, 4:30 p.m.", title: "Lava pours out",
      text: "Late in the afternoon, lava began to spill from the crater. Two flows set off: one to the north and one to the south-east. Lava is heavy, so it always runs downhill and follows valleys, like water does, but far more slowly.",
      ev: { voice: 0 },
      q: "Watch the two flows. What decides which way each one goes?",
      note: "The slope of the ground: lava follows the steepest way downhill and collects in valleys." },
    { h0: 42, h1: 70, dur: 14,
      when: "19–20 March 1944", title: "A slow, unstoppable wall",
      text: "The northern flow ran into the wall of an older volcano, Monte Somma, and turned west down the valley. It moved at 50 to 300 meters an hour, often slower than you walk. Its front was a heap of hot, broken rock that pushed over anything in its way.",
      ev: { voice: 1, photo: "front" },
      q: "At 100 meters an hour, how long would the lava take to travel the 5 km to San Sebastiano?",
      note: "5,000 m ÷ 100 m per hour = 50 hours, about two days. At 300 m an hour it is under 17 hours; at 50 m an hour, 100 hours." },
    { h0: 70, h1: 89, dur: 12,
      when: "21 March 1944, early morning", title: "The lava reaches San Sebastiano",
      text: "Early on 21 March the lava entered San Sebastiano al Vesuvio and Massa di Somma. Allied soldiers had already helped about 7,000 people leave. The lava buried streets, homes and the church, and stopped on 22 March about 140 meters above sea level.",
      ev: { photo: "sansebnight", photo2: "church" },
      q: "Lava destroyed two towns, but almost no one was killed by it. Why not?",
      note: "It moved slowly enough for people to be warned and to walk away; soldiers helped about 7,000 people leave before it arrived.",
      vrHint: "Try “Stand in San Sebastiano” to see the lava arrive at full size." },
    { h0: 89, h1: 110, dur: 14,
      when: "21–22 March 1944", title: "Fountains of fire",
      text: "On the evening of 21 March the eruption changed. Gas bursting out of the magma threw eight fountains of glowing lava into the sky, one after another, up to about 4 km high. That is about three times the height of the volcano itself.",
      ev: { voice: 2, photo: "naples" },
      q: "Norman Lewis called it “majestic and terrible.” What in the scene could be called majestic, and what terrible?",
      note: "Open answer. Majestic: the size, height and glow of the fountains. Terrible: the danger to homes and people, and the power no one could stop." },
    { h0: 110, h1: 132, dur: 14,
      when: "22–23 March 1944", title: "Ash falls from the sky",
      text: "Next came explosions. A column of ash rose more than 5 km and the wind carried it east. Ash and cinders fell on towns up to 20 km away, and on Pompeii Airfield, about 7 km from the crater, where they wrecked 78 to 88 American B-25 bombers.",
      ev: { photo: "b25", voice: 6 },
      q: "No lava reached the airfield. How did the volcano destroy the planes?",
      note: "Hot ash and cinders were blown there by the wind and fell from the sky; they damaged engines, windows and control surfaces and piled up on the aircraft." },
    { h0: 132, h1: 288, dur: 16,
      when: "23–29 March 1944", title: "The eruption fades",
      text: "Smaller explosions went on for a week, and the wind now blew the ash to the south-west. About 26 people died, most of them when heavy ash piled up on roofs until they collapsed. About 10,000 to 12,000 people lost their homes. By 29 March the eruption was over.",
      ev: { photo: "children" },
      q: "Lava or ash: which caused more harm to people in 1944? Why?",
      note: "Ash. Lava destroyed buildings but moved slowly; ash spread far with the wind, and its weight collapsed roofs, which caused most of the deaths." },
    { h0: 288, h1: 288, dur: 0,
      when: "Vesuvius today", title: "Will it erupt again?",
      text: "Vesuvius has not erupted since 1944, but it is dormant, not extinct. About 670,000 people live in the “red zone” around it. Scientists at the Vesuvius Observatory watch it day and night for earthquakes, ground movement and gas, and Italy's emergency plan is to move everyone in the red zone out within 72 hours if it starts to wake.",
      ev: { voice: 8 },
      q: "If you lived in San Sebastiano today, what would you want scientists to tell you?",
      note: "Open answer: for example, what signs they watch for, how much warning there would be, where to go and how, which hazards (lava, ash, pyroclastic flows) could reach the town.",
      links: true }
  ];

  const FACTS = "18–29 March 1944 · about 26 deaths, mostly from roofs collapsing under ash · about 10,000–12,000 people made homeless · San Sebastiano al Vesuvio and Massa di Somma destroyed · 78–88 US bombers wrecked by ash";

  // ---------- Styles (use each page's colour tokens) ----------
  const css = `
  .va-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 6px 0 8px; }
  .va-strip button { padding: 0; border: 0; border-radius: 6px; overflow: hidden; aspect-ratio: 1; background: var(--chip); cursor: pointer; }
  .va-strip img { width: 100%; height: 100%; object-fit: cover; display: block; filter: grayscale(1); }
  .va-q { font-size: 14px; font-style: italic; margin: 6px 0 2px; }
  .va-who { font-size: 12.5px; color: var(--muted); }
  dialog.va { width: min(980px, calc(100vw - 32px)); max-height: calc(100vh - 32px); padding: 0; border: 1px solid var(--rule);
    border-radius: 12px; background: var(--panel); color: var(--ink); box-shadow: 0 10px 40px rgba(0,0,0,.35); }
  dialog.va::backdrop { background: rgba(10,8,6,.6); }
  .va-head { position: sticky; top: 0; z-index: 2; background: var(--panel); border-bottom: 1px solid var(--rule); padding: 14px 18px 0; }
  .va-head h2 { margin: 0; padding-right: 48px; font-size: 19px; text-transform: none; letter-spacing: -0.01em; color: var(--ink); }
  .va-facts { font-size: 12.5px; color: var(--muted); margin: 4px 0 10px; }
  .va-x { position: absolute; right: 12px; top: 10px; padding: 4px 10px; font-size: 18px; line-height: 1; }
  .va-tabs { display: flex; gap: 2px; overflow-x: auto; }
  .va-tabs button { border: 0; border-bottom: 3px solid transparent; border-radius: 0; background: none; padding: 8px 12px; color: var(--muted); white-space: nowrap; }
  .va-tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); }
  .va-body { padding: 16px 18px 22px; }
  .va-body h3 { font-size: 16px; margin: 0 0 4px; }
  .va-film { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; margin-bottom: 22px; }
  .va-frame { position: relative; aspect-ratio: 4 / 3; background: #000; border-radius: 8px; overflow: hidden; }
  .va-frame iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
  .va-frame .va-load { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 0; background: #111; color: #fff;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; font-size: 15px; }
  .va-frame .va-load span:first-child { font-size: 38px; }
  .va-small { font-size: 12.5px; color: var(--muted); }
  .va-body a { color: var(--accent); }
  .va-body ul, .va-body ol { padding-left: 20px; margin: 6px 0; font-size: 14px; }
  .va-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
  .va-grid button { padding: 0; border: 1px solid var(--rule); border-radius: 8px; overflow: hidden; background: var(--chip); text-align: left; font-weight: 400; }
  .va-grid img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; background: #222; }
  .va-grid span { display: block; padding: 6px 8px 8px; font-size: 13px; line-height: 1.3; }
  .va-view { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; align-items: start; }
  .va-view img { width: 100%; border-radius: 8px; background: #222; display: block; }
  .va-look { border-left: 3px solid var(--accent); padding: 4px 0 4px 10px; margin: 10px 0; font-size: 14px; }
  .va-nav { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .va-voice { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 14px; padding: 14px 0; border-top: 1px solid var(--rule); }
  .va-voice:first-child { border-top: 0; padding-top: 0; }
  .va-voice img { width: 120px; aspect-ratio: 1; object-fit: cover; border-radius: 8px; background: #222; cursor: pointer; }
  .va-voice blockquote { margin: 4px 0; font-size: 16px; line-height: 1.4; font-family: Georgia, "Times New Roman", serif; }
  .va-think { font-size: 13.5px; margin-top: 4px; }
  .va-act { border: 1px solid var(--rule); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
  .va-act p { margin: 4px 0 0; font-size: 14px; }
  .va-broken { display: flex; align-items: center; justify-content: center; aspect-ratio: 4 / 3; background: var(--chip); color: var(--muted); font-size: 12.5px; padding: 8px; text-align: center; border-radius: 8px; }
  .va-strip .va-broken { aspect-ratio: 1; font-size: 10px; padding: 4px; }
  #vaCard .va-broken { aspect-ratio: auto; height: 44px; }
  #vaCard { position: absolute; left: 12px; bottom: 28px; z-index: 4; width: 300px; max-width: calc(100% - 24px); background: var(--panel); color: var(--ink);
    border: 1px solid var(--rule); border-radius: 10px; box-shadow: 0 4px 18px rgba(0,0,0,.3); overflow: hidden; display: none; }
  #vaCard.va-vr { position: fixed; left: auto; right: 12px; top: 12px; bottom: auto; }
  #vaCard.on { display: block; animation: vaIn .35s ease-out; }
  @keyframes vaIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  #vaCard img { width: 100%; height: 130px; object-fit: cover; display: block; filter: grayscale(1); cursor: pointer; }
  #vaCard .in { padding: 8px 12px 10px; }
  #vaCard .k { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--accent); font-weight: 700; }
  #vaCard blockquote { margin: 4px 0; font: 14px/1.35 Georgia, "Times New Roman", serif; }
  #vaCard .va-who { font-size: 12px; }
  #vaCard .row2 { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 6px; }
  #vaCard .row2 button { padding: 4px 10px; font-size: 12.5px; }
  @media (max-width: 760px) {
    dialog.va { width: 100vw; max-width: 100vw; height: 100%; max-height: 100%; border-radius: 0; margin: 0; }
    .va-film, .va-view { grid-template-columns: 1fr; }
    .va-voice { grid-template-columns: 72px minmax(0, 1fr); }
    .va-voice img { width: 72px; }
    #vaCard { width: 220px; left: 8px; bottom: 20px; }
    #vaCard.va-vr { left: auto; right: 8px; top: auto; bottom: 110px; }
    #vaCard img { height: 80px; }
    #vaCard blockquote { font-size: 12.5px; }
  }`;

  // ---------- Helpers ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function img(p, extra = "") {
    return `<img src="${p.src}" alt="${esc(p.title + ", " + p.date)}" loading="lazy" referrerpolicy="no-referrer" data-va-src="${p.page}" ${extra}/>`;
  }
  // Swap a photo that fails to load (e.g. a blocked host) for a link to its source.
  function guardImages(root) {
    root.querySelectorAll("img[data-va-src]").forEach(im => {
      if (im.dataset.vaGuard) return; im.dataset.vaGuard = "1";
      im.addEventListener("error", () => {
        const d = document.createElement("a"); d.className = "va-broken"; d.href = im.dataset.vaSrc; d.target = "_blank"; d.rel = "noopener";
        d.textContent = "Photo didn’t load here. Open it at the source ↗"; im.replaceWith(d);
      }, { once: true });
    });
  }

  let dlg, body, tabBtns, current = "film", viewing = null;

  function buildDialog() {
    dlg = document.createElement("dialog"); dlg.className = "va"; dlg.setAttribute("aria-labelledby", "vaTitle");
    dlg.innerHTML = `
      <div class="va-head">
        <h2 id="vaTitle">The 1944 eruption: film, photos and eyewitnesses</h2>
        <button class="va-x" aria-label="Close">×</button>
        <div class="va-facts">${FACTS}</div>
        <div class="va-tabs" role="tablist">
          <button role="tab" data-t="film">Newsreels</button>
          <button role="tab" data-t="photos">Photographs</button>
          <button role="tab" data-t="voices">Eyewitnesses</button>
          <button role="tab" data-t="tasks">Be a historian</button>
        </div>
      </div>
      <div class="va-body" role="tabpanel"></div>`;
    document.body.appendChild(dlg);
    body = dlg.querySelector(".va-body");
    tabBtns = [...dlg.querySelectorAll(".va-tabs button")];
    tabBtns.forEach(b => b.onclick = () => show(b.dataset.t));
    dlg.querySelector(".va-x").onclick = close;
    dlg.addEventListener("click", e => { if (e.target === dlg) close(); });        // click on the backdrop
    dlg.addEventListener("close", () => { body.innerHTML = ""; });                  // stops any playing film
  }
  function close() { dlg.close(); }

  function show(tab, arg) {
    current = tab; viewing = null;
    tabBtns.forEach(b => b.setAttribute("aria-selected", b.dataset.t === tab ? "true" : "false"));
    if (tab === "film") body.innerHTML = FILMS.map((f, i) => `
      <div class="va-film">
        <div>
          <div class="va-frame" id="vaF${i}"><button class="va-load" data-f="${i}"><span>▶</span><span>Play: ${esc(f.title)}</span><span class="va-small" style="color:#bbb">Loads from ${f.embed.includes("youtube") ? "YouTube" : "the Internet Archive"}</span></button></div>
          <div class="va-small" style="margin-top:4px">${esc(f.by)} · <a href="${f.page}" target="_blank" rel="noopener">Open at the source ↗</a></div>
        </div>
        <div>
          <h3>${esc(f.title)}</h3>
          <p style="font-size:14px;margin:4px 0 8px">${esc(f.about)}</p>
          <b style="font-size:14px">Watch for</b>
          <ul>${f.watch.map(w => `<li>${esc(w)}</li>`).join("")}</ul>
        </div>
      </div>`).join("") + `<p class="va-small">Newsreel footage © British Pathé, embedded with the YouTube player as British Pathé allows without a licence. Castle Films newsreel from the Periscope Film collection, embedded with the Internet Archive player from their public upload.</p>`;
    if (tab === "photos") {
      if (arg) return viewPhoto(arg);
      body.innerHTML = `<p style="margin:0 0 10px;font-size:14px">Most of these were taken in 1944 by Melvin C. Shaffer, a US Army medical photographer (credit: DeGolyer Library, Southern Methodist University). The B-25 photo is by the US Army Air Forces. Choose a photo to look closely.</p>
        <div class="va-grid">${PHOTOS.map(p => `<button data-p="${p.id}">${img(p)}<span>${esc(p.title)}</span></button>`).join("")}</div>`;
    }
    if (tab === "voices") body.innerHTML = VOICES.filter(v => !v.photoOnly).map(v => {
      const p = v.photo && P[v.photo];
      return `<div class="va-voice">
        <div>${p ? `<button data-p="${p.id}" style="padding:0;border:0;background:none" aria-label="Photo: ${esc(p.title)}">${img(p)}</button>` : ""}</div>
        <div>
          ${v.quote ? `<blockquote>“${esc(v.quote)}”</blockquote>` : `<p style="margin:0 0 4px;font-size:14.5px">${esc(v.para)}</p>`}
          <div class="va-who"><b>${esc(v.who)}</b>, ${esc(v.role)} · ${esc(v.when)} · <a href="${v.src}" target="_blank" rel="noopener">${esc(v.srcName)} ↗</a></div>
          ${v.think ? `<div class="va-think"><b>Think:</b> ${esc(v.think)}</div>` : ""}
        </div></div>`;
    }).join("") + `<p class="va-small" style="margin-top:12px">Quotes are short extracts, credited to their sources. Most eyewitness accounts in English come from Allied soldiers. The local people of San Sebastiano and Massa di Somma told their stories in Italian, for example in <i>Vesuvio 1944: l’ultima eruzione</i> (Pesce and Rolandi, 1994).</p>`;
    if (tab === "tasks") body.innerHTML = ACTIVITIES.map((a, i) => `<div class="va-act"><b>${i + 1}. ${esc(a.t)}</b><p>${a.b}</p></div>`).join("");
    body.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { tabBtns.forEach(t => t.setAttribute("aria-selected", t.dataset.t === "photos" ? "true" : "false")); viewPhoto(b.dataset.p); });
    body.querySelectorAll("[data-f]").forEach(b => b.onclick = () => {
      const f = FILMS[+b.dataset.f];
      b.parentElement.innerHTML = `<iframe src="${f.embed}${f.embed.includes("youtube") ? "&autoplay=1" : ""}" title="${esc(f.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    });
    guardImages(body); body.scrollTop = 0; dlg.scrollTop = 0;
  }

  function viewPhoto(id) {
    current = "photos"; viewing = id;
    const i = PHOTOS.findIndex(p => p.id === id), p = PHOTOS[i];
    const prev = PHOTOS[(i + PHOTOS.length - 1) % PHOTOS.length], next = PHOTOS[(i + 1) % PHOTOS.length];
    body.innerHTML = `<div class="va-view">
      <div>${img(p)}</div>
      <div>
        <h3>${esc(p.title)}</h3>
        <div class="va-small">${esc(p.date)}</div>
        <div class="va-look"><b>Look closely:</b> ${esc(p.look)}</div>
        <div class="va-small">${esc(p.credit)} · <a href="${p.page}" target="_blank" rel="noopener">Source ↗</a></div>
        <div class="va-nav">
          <button data-go="${prev.id}">← Previous</button><button data-go="${next.id}">Next →</button><button data-all>All photos</button>
        </div>
      </div></div>`;
    body.querySelectorAll("[data-go]").forEach(b => b.onclick = () => viewPhoto(b.dataset.go));
    body.querySelector("[data-all]").onclick = () => show("photos");
    guardImages(body);
  }

  function open(tab = "film", arg) {
    if (!dlg) buildDialog();
    show(tab, arg);
    if (!dlg.open) dlg.showModal();
  }

  // ---------- Panel section ----------
  function mount({ panel, page, mapwrap }) {
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const v = VOICES[1], strip = ["sansebnight", "front", "church", "b25"].map(id => P[id]);
    panel.innerHTML = `
      <div class="va-strip">${strip.map(p => `<button data-p="${p.id}" aria-label="Photo: ${esc(p.title)}">${img(p)}</button>`).join("")}</div>
      <p class="va-q">“${esc(v.quote)}”</p>
      <div class="va-who">${esc(v.who)} · ${esc(v.when)}</div>
      <div class="btns">
        <button data-open="film">▶ Watch the 1944 newsreels</button>
        <button data-open="voices">Eyewitnesses</button>
        <button data-open="photos">Photos</button>
        <button data-open="tasks">Be a historian</button>
      </div>
      <p class="hint" style="margin-top:8px">${page === "vr"
        ? "Eyewitness accounts appear as the eruption plays, on screen and on the menu in the headset. Newsreels and photos open here, not in the headset."
        : page === "3d"
        ? "Eyewitness accounts pop up on the map as the eruption plays, at the time they were written."
        : "Real photographs, newsreels and diaries from March 1944. Use them to check what the model gets right and what it can’t show."}</p>`;
    panel.querySelectorAll("[data-open]").forEach(b => b.onclick = () => open(b.dataset.open));
    panel.querySelectorAll("[data-p]").forEach(b => b.onclick = () => open("photos", b.dataset.p));
    guardImages(panel);
    if ((page === "3d" || page === "vr") && mapwrap) {
      card = document.createElement("div"); card.id = "vaCard"; card.setAttribute("aria-live", "polite");
      if (page === "vr") card.classList.add("va-vr");
      mapwrap.appendChild(card);
    }
    document.querySelectorAll(".va-ver").forEach(el => { el.textContent = "archive v" + ARCHIVE_VERSION; });
  }

  // ---------- Timeline cards (3D page) ----------
  let card = null, shownIdx = -1, cardsOn = true;
  const TL = VOICES.filter(v => v.h != null).sort((a, b) => a.h - b.h);
  function indexAt(h, active) {
    let idx = -1;
    if (active && cardsOn) for (let i = 0; i < TL.length; i++) {
      const until = Math.min(TL[i].h + 24, i + 1 < TL.length ? TL[i + 1].h : Infinity);
      if (h >= TL[i].h && h < until) idx = i;
    }
    return idx;
  }
  function momentAt(h, active) {
    const i = indexAt(h, active); if (i < 0) return null;
    const v = TL[i];
    return v.photoOnly ? { when: v.when, text: v.caption, who: "" }
                       : { when: v.when, text: "“" + v.quote + "”", who: v.who + ", " + v.role };
  }
  function atHour(h, active) {
    if (!card) return;
    const idx = indexAt(h, active);
    if (idx === shownIdx) return;
    shownIdx = idx;
    if (idx < 0) { card.classList.remove("on"); card.innerHTML = ""; return; }
    const v = TL[idx], p = v.photo && P[v.photo];
    card.innerHTML = `${p ? img(p, `data-p="${p.id}"`) : ""}<div class="in">
      <div class="k">${v.photoOnly ? "Photograph" : "Eyewitness"} · ${esc(v.when)}</div>
      ${v.photoOnly ? `<div style="font-size:13.5px;margin-top:4px">${esc(v.caption)}</div>`
        : `<blockquote>“${esc(v.quote)}”</blockquote><div class="va-who">${esc(v.who)}, ${esc(v.role)}</div>`}
      <div class="row2"><button data-more>More from 1944</button><button data-hide aria-label="Hide eyewitness cards">Hide</button></div></div>`;
    card.classList.remove("on"); void card.offsetWidth; card.classList.add("on");
    const im = card.querySelector("img[data-p]"); if (im) im.onclick = () => open("photos", im.dataset.p);
    card.querySelector("[data-more]").onclick = () => open(v.photoOnly ? "photos" : "voices", v.photoOnly ? v.photo : undefined);
    card.querySelector("[data-hide]").onclick = () => setCards(false);
    guardImages(card);
  }
  function setCards(on) {
    cardsOn = on; shownIdx = -2;
    if (!on && card) { card.classList.remove("on"); card.innerHTML = ""; }
    const cb = document.getElementById("eVoices"); if (cb) cb.checked = on;
  }

  document.addEventListener("keydown", e => {
    if (!dlg || !dlg.open || !viewing) return;
    const i = PHOTOS.findIndex(p => p.id === viewing);
    if (e.key === "ArrowRight") viewPhoto(PHOTOS[(i + 1) % PHOTOS.length].id);
    if (e.key === "ArrowLeft") viewPhoto(PHOTOS[(i + PHOTOS.length - 1) % PHOTOS.length].id);
  });

  window.VesuviusArchive = { version: ARCHIVE_VERSION, mount, open, atHour, momentAt, setCards,
    data: { PHOTOS, VOICES, FILMS, ACTIVITIES, FACTS, STORY }, guardImages };
})();
