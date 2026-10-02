/*
<javascriptresource>
<name>Auto Insert Txt to Comic [Plastic Tears]</name>
<about>
Auto Insert Txt to Comic v1.5.2 by Plastic Tears

https://plastictears.com/
</about>
</javascriptresource>
*/


/*
--------------------------------------------------------------------------------
Auto Insert Txt to Comic v1.5.2
by Luigi (https://plastictears.com/)

Inspired by the original Insert Txt to Comic script:
  https://github.com/pespositotlr/insert-txt-text-to-comic/
Auto-centering code based on TypeR:
  https://github.com/ScanR/TypeR

Reads a formatted translation .txt and typesets it into .psd/.psb files,
placing each line using either PanelCleaner OCR coordinates (CSV) or a fallback grid.

Full documentation:  README.md
Version history:     CHANGELOG.md
--------------------------------------------------------------------------------
*/

#target photoshop;

// Encoding note: this file has no BOM, and Photoshop decides how to decode such a file from its
// first few KB. Non-ASCII characters in CODE must therefore be written as \uXXXX escapes: the literal
// curly quotes, guillemets and accents inside regexes were read as mojibake, so quote styling (and the
// accented Pagina marker) silently matched nothing. Comments are safe either way.

// Built-in style presets. Each entry maps a speaker tag to [fontName, size, hexColor],
// or just [fontName, hexColor] when the size should come from Smart Sizing or the
// default. The font string can carry bracket tags: [V## H##] for vertical/horizontal
// scale, [L##] for auto-leading percentage, [CAPS] and [STROKE] for those effects.
var masterStyles = {
    "Sample Style 1": {
        "default": ["Nerves of Steel BB [V110 L100]", 14, "000000"],
        "SFX": ["CCALikelyStory [CAPS STROKE]", 16, "000000"],
        "Thick": ["CCSoothsayer [L110]", 14, "000000"],
        "Ornate": ["CCSoothsayer [L110]", 14, "000000"],
        "Angry": ["CCSoothsayer [L110]", 14, "000000"],
        "Narrator": ["CCSamaritanTall-Regular", 14, "000000"],
        "Narr": ["CCSamaritanTall-Regular", 14, "000000"],
        "Scary": ["CCSeanPhillips [H90 L110]", 14, "000000"],
        "Thin": ["CCGrimNGritty [L115]", 14, "000000"],
        "Audio": ["Nightmark BB [L90]", 14, "000000"],
        "Phone": ["Nightmark BB [L90]", 14, "000000"],
        "Speaker": ["Nightmark BB [L90]", 14, "000000"],
        "Call": ["Nightmark BB [L90]", 14, "000000"],
        "Pointy": ["CCRedStar [L110]", 14, "000000"],
        "Flavor": ["CCLegendaryLegerdemainLeggy [L100]", 14, "000000"],
        "Ad": ["CCLegendaryLegerdemainLeggy [L100]", 14, "000000"],
        "Injured": ["Restless Soul BB [L90]", 14, "000000"],
        "Flashback": ["CCOriginStory [V125 H125]", 14, "000000"],
        "Silly": ["CCWallScrawler [V100 H95]", 14, "000000"],
        "Rushout": ["AfterDisaster-Regular [L100]", 14, "000000"],
        "Info": ["Interstate Condensed [V125 H125]", 14, "000000"],
        "Sharp": ["SS Spicy Noodles 2 [V130 H130]", 14, "000000"]
    },
	"Sample Style 2": {
        "default": ["Ready for Anything BB [L90]", 24, "000000"],
        "Narration": ["CCSoliloquous [H90]", 24, "000000"],
		"Narrator": ["CCSoliloquous [H90]", 24, "000000"],
		"Narr": ["CCSoliloquous [H90]", 24, "000000"],
        "Titles": ["CoolveticaCondensedRg", 24, "000000"],
		"Title": ["CoolveticaCondensedRg", 24, "000000"],
		"Audio": ["Nightmark BB [L90]", 24, "000000"],
        "Phone": ["Nightmark BB [L90]", 24, "000000"],
        "Speaker": ["Nightmark BB [L90]", 24, "000000"],
        "Call": ["Nightmark BB [L90]", 24, "000000"],
		"Electronic": ["Nightmark BB [L90]", 24, "000000"],
        "Whispered": ["CCHushHush [V120]", 24, "000000"],
        "Whisper": ["CCHushHush [V120]", 24, "000000"],
		"Handwritten": ["CCScoundrel-Bold [V110 CAPS]", 24, "000000"],
		"Hand": ["CCScoundrel-Bold [V110 CAPS]", 24, "000000"],
		"Letters": ["CCFaceFront [V110 CAPS]", 24, "000000"],
		"Letter": ["CCFaceFront [V110 CAPS]", 24, "000000"],
		"SFX": ["RipsnortBB [STROKE]", 24, "000000"],
        "Sharp": ["SS Spicy Noodles 2 [V124 H124]", 24, "000000"]
    },
	// the styles used by the two demo pages (JoJolion c018 p169 and p189)
	"Sample Style 4": {
        "default": ["Nerves of Steel BB [V130 H120]", "000000"],
        "Josuke": ["Nerves of Steel BB [V130 H120]", "004b66"],
        "Josuke_Narrador": ["CCSamaritanTall-Regular", "004b66"],
        "Joshu": ["Nerves of Steel BB [V130 H120]", "01340e"],
        "Joshu_Grito": ["CCSoothsayer", "01340e"]
	}
};

// the style set picked in the dropdown (or loaded from an external JSON)
var activeProjectStyle = {};

// Batch state lives in globals because suspendHistory can only eval a plain code
// string (see runProcessPage), so nothing can be passed in as arguments.
var g_txtFileData = "";
var g_csvMap = {};
var g_mismatchLogs = [];
var g_originalDPI = 72;
var g_csvLoaded = false;
// fonts the style set asks for that aren't installed, one line each for the log
// (see resolveFont). Filled while typesetting, written at the top of the log file.
var g_fontWarnings = [];
var g_fontWarned = {};
// installed fonts, read once per batch on first use (see loadFontIndex);
// false = Photoshop wouldn't hand over its font list
var g_fonts = null;
// stringIDToTypeID cache (see sid)
var g_sid = {};

// dialog choices, filled in when the user hits OK
var g_useSmartSizing = false;
var g_forceSmartSizing = false; 
var g_useMarkdown = true;
var g_useBoldQuotes = true;
var g_removeQuotes = false;
var g_useStroke = false;
var g_useBouncySFX = true;
var g_keepTagsString = "N/T, T/N, Note, Nota";

// Smart Sizing bounds. Named "PT" for historical reasons, but the values are
// applied as pixels - the script forces pixel units at a 72 DPI baseline, so
// they behave like points in practice. Short lines get MAX_PT, long lines
// scale down toward MIN_PT.
var MAX_PT = 10; //9 Default //12 
var MIN_PT = 5;
var MIN_CHAR = 3;
// Line length (non-space chars) at which text reaches MIN_PT. Tune to your
// material: lines longer than this all bottom out at MIN_PT, so setting it far
// above your actual line lengths wastes the low end of the curve and leaves
// almost everything near MAX_PT. ~50 suits typical manga dialogue; raise it if
// your lines run long, lower it to push medium lines smaller.
var MAX_CHAR = 50;
// Smart Sizing snaps its result to this granularity so you never get sizes like
// 7.83pt. This only controls rounding, not how big text is - the average size is
// the same at any step; a finer step just tracks line length more smoothly.
var SIZE_STEP = 0.25;

// PostScript suffixes appended to the font root when markdown / quote styling swap styles
var boldSuffix = "-Bold";
var italicSuffix = "-Italic";
var boldItalicSuffix = "-BoldItalic";
var quoteitalicsuff = "-BoldItalic"; // style used for quoted spans (see applyQuoteRanges)

// Speaker tags that are notes rather than dialogue. They never consume a CSV
// coordinate box and ALWAYS will land on the fallback grid.
var exclusionRegex = /^(N\/T|T\/N|Note|Nota|SFX|Mano|Handwritten)$/i;
// Matches lines that are just a page marker ("Page 1:", "Hoja 03", "3-4:").
// These contain a colon, so without this guard they'd get parsed as speaker "Page 1"
// and pollute the speaker carry-over for continuation lines.
var pageMarkerLineRegex = /^\s*(?:Page|Hoja|P[a\u00e1]gina)?\s*\d+(?:\s*-\s*\d+)?\s*:?\s*$/i;
// Speakers listed here become point text instead of paragraph text (point text
// hugs the glyphs, which makes SFX easier to warp later). Add alternatives
// separated by "|", e.g. /^(SFX|SFX_B|SFX_W|)$/i - case-insensitive,
// and it must match the whole speaker tag.
var pointTextRegex = /^(SFX|SFX_B|SFX_W|Handwritten|Mano|Sign|Hand)$/i;

// Bouncy SFX (ported from BouncySFX.jsx v2.1): in a run of 3+ identical letters
// every other letter is lifted off the baseline and the ones left down get extra
// tracking so the run doesn't bunch up. Applied to the speakers below when the
// "Bouncy SFX" box is ticked. Existing character styling is preserved: nothing
// but baselineShift and tracking is written.
var bouncyRegex = /^(SFX|SFX_B|SFX_W)$/i;
var BOUNCY_SHIFT_PT = 0.5;      // baseline lift, in points at the page's real DPI
var BOUNCY_TRACKING = 50;       // extra tracking on the letters left down (1/1000 em)
var BOUNCY_TRIGGER_COUNT = 3;   // identical letters in a row before it kicks in
var BOUNCY_LETTERS_ONLY = true; // false = punctuation runs ("...", "!!!") bounce too

// Spread PSDs named "..._011-012" can use single-page CSV rows ("..._011" and
// "..._012") when the CSV has no row for the spread itself. Each page is given
// an equal share of the spread's width. true = the first page sits on the RIGHT
// half (manga reading order); false = on the left (western comics).
var SPREAD_RTL = true;
// A candidate speaker tag longer than this is assumed to be dialogue that
// happens to contain a colon, not a tag (see splitSpeakerTag).
var SPEAKER_MAX_CHARS = 30;
var strokepercentage = 0.25; // stroke size as a percentage of canvas height (only used with the [STROKE] tag + checkbox)

// dark red applied to quoted spans on colored pages (plain black/white text keeps its color), based on the JoJolion colored manga
var QUOTE_RED_R = 160;
var QUOTE_RED_G = 0;
var QUOTE_RED_B = 20;
// ***bold-italic*** gets the same dark red as quoted text, under the same rule (colour pages, text
// that isn't near-black/near-white). false = ***three*** only swaps the font, like **two** and *one*.
var MARKDOWN_BOLDITALIC_RED = true;

// version + links shown in the About dialog
var SCRIPT_VERSION = "1.5.2";
var URL_SITE = "https://plastictears.com/";
var URL_GITHUB = "https://github.com/luigidesu/Auto-Insert-Txt-to-Comic";

// progress window state. Lives in a global so processPage (which runs through
// suspendHistory's eval, see runProcessPage) can reach it without arguments.
var g_progress = null;
var PROGRESS_PREVIEW_CHARS = 45; // current-line preview gets cut here so long lines can't stretch the window
// How long the "All done!" state stays on screen before the window closes itself.
// NOTE: palettes die the instant the script exits, so this countdown IS what keeps
// it alive - and Photoshop stays busy while it runs. Keep it short.
var DONE_AUTOCLOSE_SECONDS = 10;

main();

function main() {
    var originalRuler = app.preferences.rulerUnits;
    var originalType = app.preferences.typeUnits;
    app.preferences.rulerUnits = Units.PIXELS; 
    app.preferences.typeUnits = TypeUnits.PIXELS; 

    // everything below lives in this try/finally so the user's units get restored
    // no matter where the script exits or dies
    try {

    // If exactly ONE .json sits in the script's own folder, it silently becomes
    // the style source instead of the built-in presets (see findSiblingStyleJson
    // for the zero/several-JSONs rule). The "Prefer folder JSON" checkbox in the
    // dialog lets the user flip back to the built-ins without moving files.
    var builtinStyles = masterStyles;
    var folderStyles = null;
    var folderJsonFile = findSiblingStyleJson();
    if (folderJsonFile) {
        // a broken folder JSON falls back to the built-ins, no nagging
        try { folderStyles = readStyleJson(folderJsonFile); } catch (autoErr) { folderStyles = null; }
    }
    if (folderStyles) masterStyles = folderStyles;

    var ui = new Window("dialog", "Auto Insert Txt to Comic v" + SCRIPT_VERSION);
    ui.orientation = "column";
    ui.alignChildren = "fill";

    // style picker: preset dropdown plus an external JSON loader
    var groupStyle = ui.add("panel", undefined, "Style Selection");
    groupStyle.orientation = "column";
    groupStyle.alignChildren = "left";
    var rowStyle = groupStyle.add("group");
    rowStyle.orientation = "row";
    var dd = rowStyle.add("dropdownlist", undefined, getStyleNames());
    dd.selection = 0;
    dd.preferredSize.width = 200;
    dd.helpTip = "Style preset to use. Each one maps speaker tags to a font, size and color.";
    var btnLoad = rowStyle.add("button", undefined, "Load JSON...");
    btnLoad.helpTip = "Load styles from an external .json file (same shape as the built-in presets).";

    function refreshStyleDropdown() {
        dd.removeAll();
        var styleNames = getStyleNames();
        for (var n = 0; n < styleNames.length; n++) dd.add("item", styleNames[n]);
        dd.selection = 0;
    }

    // only exists when a folder JSON was auto-loaded: unchecking swaps the
    // dropdown back to the built-in presets, re-checking restores the JSON
    var chkFolderJson = null;
    if (folderStyles) {
        chkFolderJson = groupStyle.add("checkbox", undefined, "Prefer folder JSON (" + folderJsonFile.displayName + ")");
        chkFolderJson.value = true;
        chkFolderJson.helpTip = "This style JSON was found next to the script and loaded automatically. Uncheck to use the built-in presets instead.";
        chkFolderJson.onClick = function() {
            masterStyles = chkFolderJson.value ? folderStyles : builtinStyles;
            refreshStyleDropdown();
        };
    }

    // placement source: OCR CSV boxes, with the grid as fallback
    var groupOptions = ui.add("panel", undefined, "Placement Options");
    groupOptions.alignChildren = "left";
    var chkCSV = groupOptions.add("checkbox", undefined, "Use OCR CSV for Placement");
    chkCSV.value = true;
    chkCSV.helpTip = "Place dialogue using PanelCleaner OCR coordinates from a CSV. Unchecked (or CSV missing a page) = fallback grid.";

    // global toggles
    var groupSettings = ui.add("panel", undefined, "Global Settings");
    groupSettings.alignChildren = "left";

    var chkSmartSizing = groupSettings.add("checkbox", undefined, "Enable Smart Sizing (Fallback for missing JSON sizes)");
    chkSmartSizing.value = true; // on by default - it only kicks in for styles with no hardcoded size
    chkSmartSizing.helpTip = "Auto font size based on line length, used only when a style has no hardcoded size.";

    var chkForceSmartSizing = groupSettings.add("checkbox", undefined, "Force Smart Sizing (Override hardcoded JSON sizes)");
    chkForceSmartSizing.value = false;
    chkForceSmartSizing.helpTip = "Ignore every hardcoded size and always auto-size from line length.";
    chkForceSmartSizing.indent = 20; // 'margins' is a container property and did nothing on a checkbox

    // the override only makes sense while smart sizing itself is on
    chkForceSmartSizing.enabled = chkSmartSizing.value;
    chkSmartSizing.onClick = function() {
        chkForceSmartSizing.enabled = chkSmartSizing.value;
        if (!chkSmartSizing.value) {
            chkForceSmartSizing.value = false;
        }
    };
    var chkMarkdown = groupSettings.add("checkbox", undefined, "Use Markdown-like Features (*, **, ***)");
    chkMarkdown.value = true;
    chkMarkdown.helpTip = "*italic*, **bold** and ***bold-italic*** in the txt become styled spans (***bold-italic*** is also dark red on colour pages, like quotes).";

    var chkBoldQuotes = groupSettings.add("checkbox", undefined, "Apply Quote Styling (Bold-Italic & Color)");
    chkBoldQuotes.value = true;
    chkBoldQuotes.helpTip = "Text inside quotes gets bold-italic plus the quote color.";

    var chkRemoveQuotes = groupSettings.add("checkbox", undefined, "Remove Quotes after Styling");
    chkRemoveQuotes.value = false;
    chkRemoveQuotes.indent = 20; 
    chkRemoveQuotes.helpTip = "Strip the quote characters themselves after styling what was inside them.";

    // removing quotes only makes sense while quote styling is on
    chkRemoveQuotes.enabled = chkBoldQuotes.value;
    chkBoldQuotes.onClick = function() {
        chkRemoveQuotes.enabled = chkBoldQuotes.value;
        if (!chkBoldQuotes.value) {
            chkRemoveQuotes.value = false;
        }
    };

    var chkAddStroke = groupSettings.add("checkbox", undefined, "Enable [STROKE] Font Tag");
    chkAddStroke.value = false;
    chkAddStroke.helpTip = "Fonts carrying the [STROKE] tag get an inverted stroke layer effect (size scales with canvas height).";

    var chkBouncy = groupSettings.add("checkbox", undefined, "Bouncy SFX (lift every other repeated letter)");
    chkBouncy.value = true;
    chkBouncy.helpTip = "SFX with a run of 3+ identical letters (\"KRRRR\") get every other letter lifted off the baseline, BouncySFX-style. Which speakers count is set by bouncyRegex at the top of the script.";
    
    // tags listed here keep their "Tag:" prefix in the typeset text
    var tagGroup = groupSettings.add("group");
    tagGroup.margins = [0, 10, 0, 0];
    tagGroup.add("statictext", undefined, "Keep Tags (comma-separated):");
    var inputKeepTags = tagGroup.add("edittext", undefined, g_keepTagsString);
    inputKeepTags.characters = 20;
    inputKeepTags.helpTip = "Speaker tags listed here keep their \"Tag:\" prefix in the typeset text instead of having it stripped.";

    // OK / Cancel / About row
    var groupButtons = ui.add("group");
    groupButtons.alignment = "center";
    var btnOK = groupButtons.add("button", undefined, "OK", {name: "ok"});
    var btnCancel = groupButtons.add("button", undefined, "Cancel", {name: "cancel"});
    var btnAbout = groupButtons.add("button", undefined, "About");
    btnAbout.onClick = showAboutDialog;

    btnOK.onClick = function() {
        g_useSmartSizing = chkSmartSizing.value;
        g_forceSmartSizing = chkForceSmartSizing.value;
        g_useMarkdown = chkMarkdown.value;
        g_useBoldQuotes = chkBoldQuotes.value;
        g_removeQuotes = chkRemoveQuotes.value;
        g_useStroke = chkAddStroke.value;
        g_useBouncySFX = chkBouncy.value;
        g_keepTagsString = inputKeepTags.text;
        ui.close(1); 
    };
    btnCancel.onClick = function() { ui.close(2); };

    btnLoad.onClick = function() {
        var userFile = File.openDialog("Select Style JSON", "JSON Files:*.json");
        if (!userFile) return;
        try {
            masterStyles = readStyleJson(userFile);
            refreshStyleDropdown();
            // a manual load overrides the auto-loaded folder JSON;
            // re-checking the box would bring the folder JSON back
            if (chkFolderJson) chkFolderJson.value = false;
            alert("JSON Styles loaded successfully!");
        } catch(e) {
            alert("Error parsing JSON. Ensure the format matches the masterStyles object exactly.\n\nError details: " + e.message);
        }
    }

    if (ui.show() != 1) return;

    if (dd.selection) {
        activeProjectStyle = masterStyles[dd.selection.text];
    } else {
        return;
    }

    if (chkCSV.value) {
        var csvFile = File.openDialog("Select OCR Data (.csv)", "CSV Files:*.csv");
        if (csvFile) {
            var csvData = "";
            try {
                csvFile.open('r');
                csvData = csvFile.read();
            } finally {
                try { csvFile.close(); } catch(e) {}
            }
            g_csvMap = parseCSV(csvData);
            g_csvLoaded = true;
        } else {
            g_csvLoaded = false;
        }
    }

    var selectedPSDs = File.openDialog("Select PSDs", "Photoshop Files:*.psd;*.psb", true);
    if (!selectedPSDs || selectedPSDs.length == 0) return;

    var manualTxt = File.openDialog("Select translation txt", "TXT File:*.txt");
    if (!manualTxt) return;

    try {
        manualTxt.open('r');
        g_txtFileData = manualTxt.read();
    } finally {
        try { manualTxt.close(); } catch(e) {}
    }

    // Accept keyword markers ("Page 1:") or bare-number markers at line start ("03:") - matches getCurrentPageNumberIndex's two-pass detection.
    var scriptFormatRegex = /(?:Page|Hoja|P[a\u00e1]gina)\s*\d+|(?:^|\r?\n)\s*\d+(?:\s*-\s*\d+)?\s*:/i;
    if (!scriptFormatRegex.test(g_txtFileData)) {
        alert("Error: Could not detect page markers. Ensure pages start with 'Page 1:', 'Hoja 2:', 'Pagina 3:' or an isolated number like '03:'.");
        return;
    }

    // Placement mode is decided once here for the whole batch (individual pages
    // can still fall back to the grid when the CSV has no coordinates for them).
    var placementMode = g_csvLoaded ? "Using OCR pasting" : "Using grid pattern pasting";
    var batch = runBatch(selectedPSDs, placementMode);
    var pagesOK = batch.pagesOK;
    var batchCancelled = batch.cancelled;
    var cancelledPageName = batch.cancelledPageName;

    if (g_mismatchLogs.length > 0 || g_fontWarnings.length > 0) {
        var logFolder = selectedPSDs[0].parent;
        var logFile = new File(logFolder + "/Auto Insert Txt to Comic Log.txt");
        try {
            logFile.open("w");
            logFile.write("Auto Insert Txt to Comic Mismatch Log\n");
            logFile.write("\n\n");
            if (g_fontWarnings.length > 0) {
                logFile.write("Fonts:\n" + g_fontWarnings.join("\n") + "\n\n\n");
            }
            logFile.write(g_mismatchLogs.join("\n\n"));
        } finally {
            try { logFile.close(); } catch(e) {}
        }

        var problems = [];
        if (g_mismatchLogs.length > 0) problems.push("line mismatches");
        if (g_fontWarnings.length > 0) problems.push("fonts that aren't installed");
        var found = (g_mismatchLogs.length > 0 ? "Mismatches" : "Missing fonts") +
                    (g_mismatchLogs.length > 0 && g_fontWarnings.length > 0 ? " and missing fonts" : "") + " found!";

        // no countdown here: the modal alert keeps the summary window alive behind
        // it, and mismatch news shouldn't silently vanish while the user is away
        progressFinishBatch(pagesOK, selectedPSDs.length,
            batchCancelled ? "Cancelled. Mismatch log saved in your PSD folder." : found + " Log saved in your PSD folder.",
            false, batchCancelled);
        alert((batchCancelled ? "Typesetting Cancelled." : "Typesetting Complete!") +
            (cancelledPageName ? "\n" + cancelledPageName + " was closed without saving." : "") +
            "\n\nThere were " + problems.join(" and ") + ". A log file has been saved in your PSD folder:\n" + logFile.fsName);
    } else if (batchCancelled) {
        progressFinishBatch(pagesOK, selectedPSDs.length,
            cancelledPageName ? "Cancelled. Last page closed unsaved; earlier pages are saved." : "Cancelled. Already-typeset pages are saved.",
            true, true);
    } else if (g_csvLoaded) {
        progressFinishBatch(pagesOK, selectedPSDs.length, "Perfect match on all CSV files!", true);
    } else {
        progressFinishBatch(pagesOK, selectedPSDs.length, "Grid placement successful.", true);
    }

    } finally {
        // runs on every exit path: normal completion, early return, or uncaught error
        closeProgressWindow(); // safe to call twice; no-op once g_progress is null
        restoreUnits(originalRuler, originalType);
    }
}

// Opens, typesets, saves and closes every PSD in turn. Split out of main() so a
// batch can also be driven without the dialogs (the test harness does exactly
// that). Returns { pagesOK, cancelled, cancelledPageName }.
function runBatch(selectedPSDs, placementMode) {
    createProgressWindow(selectedPSDs.length, placementMode);
    var pagesOK = 0;
    var batchCancelled = false;
    var cancelledPageName = "";

    for (var i = 0; i < selectedPSDs.length; i++) {
        // Cancel takes effect between pages: the page in flight is finished and
        // saved, everything after it is left untouched.
        if (g_progress && g_progress.cancelled) {
            batchCancelled = true;
            break;
        }
        progressSetPage(i + 1, selectedPSDs.length);
        var doc = null;
        try {
            doc = open(selectedPSDs[i]);
            g_originalDPI = doc.resolution;
            
            // drop to 72 DPI without resampling so the pixel math sits on the same
            // baseline for every scan resolution; the original DPI comes back after
            doc.resizeImage(undefined, undefined, 72, ResampleMethod.NONE);
            
            // suspendHistory wraps the whole page into a single undo step
            doc.suspendHistory("Insert Text", "runProcessPage()");
            
            doc.resizeImage(undefined, undefined, g_originalDPI, ResampleMethod.NONE);
            doc.save();
            doc.close(SaveOptions.DONOTSAVECHANGES); // already saved above; avoids a redundant second save pass
            pagesOK++;
        } catch (docErr) {
            if (isUserCancel(docErr)) {
                // Esc is Photoshop's own cancel: it surfaces as an error thrown out of
                // whatever call was running, so it used to read as "this page failed"
                // and the batch marched on to the next one. It means stop everything:
                // the page in flight is closed WITHOUT saving (left as it was on disk)
                // and nothing after it is touched.
                batchCancelled = true;
                cancelledPageName = selectedPSDs[i].name;
                progressNote("Stopped with Esc - this page was closed without saving.");
                if (doc) {
                    try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (closeErr) {}
                }
                break;
            }
            // Log and move on so a single bad page never nukes the whole batch
            g_mismatchLogs.push("ERROR on " + selectedPSDs[i].name + ": " + docErr.message +
                (docErr.line ? " (line " + docErr.line + ")" : ""));
            progressNote("Error on this page - logged, moving on...");
            if (doc) {
                // Close without saving so the original file on disk is left untouched
                try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (closeErr) {}
            }
        }
    }

    return { pagesOK: pagesOK, cancelled: batchCancelled, cancelledPageName: cancelledPageName };
}

// Photoshop's own cancel (Esc) arrives as an error thrown out of whatever call
// was running: number 8007, "User cancelled the operation". The number doesn't
// always survive the trip through suspendHistory's eval, so the message is
// checked too (it also catches the localized "cancelo" spellings).
function isUserCancel(e) {
    if (!e) return false;
    if (e.number === 8007) return true;
    return /cancel/i.test(String(e.message || e));
}

// For the catch blocks around tweaks that are allowed to fail quietly. Esc is
// thrown by whichever Photoshop call happens to be running, so a catch that
// swallowed everything would eat the cancel and let the batch carry on.
function rethrowIfCancel(e) {
    if (isUserCancel(e)) throw e;
}

// suspendHistory can only eval a plain code string, so this no-argument wrapper
// exists to hand processPage its state through the globals above.
function runProcessPage() {
    processPage(g_txtFileData, g_originalDPI, g_csvMap, g_mismatchLogs);
}

// Strips [bracket tags] and the file extension, trims whitespace.
// Used on both the PSD name and the CSV filenames so "[Plastic Tears] p003.psd"
// still matches a CSV row for "p003.png". (getCurrentPageNumberIndex already
// stripped brackets for page detection; CSV lookup now does the same.)
function normalizeDocName(name) {
    return String(name)
        .replace(/\[.*?\]/g, "")
        .replace(/\.[^\.]+$/, '')
        .replace(/^\s+|\s+$/g, '');
}

// PanelCleaner CSV -> { normalized filename: [{startx, starty, endx, endy}, ...] }.
// Starts at row 1 to skip the header, and ignores blank or malformed rows.
function parseCSV(csvText) {
    var map = {};
    var rows = csvText.split(/\r?\n/);
    for (var i = 1; i < rows.length; i++) { 
        if (rows[i].replace(/^\s+|\s+$/g, '') === "") continue; 
        var cols = rows[i].split(",");
        if (cols.length >= 6) {
            var filename = normalizeDocName(cols[0]); 
            if (!map[filename]) map[filename] = [];
            map[filename].push({
                startx: parseFloat(cols[1]),
                starty: parseFloat(cols[2]),
                endx: parseFloat(cols[3]),
                endy: parseFloat(cols[4])
            });
        }
    }
    return map;
}

// csvMap lookup that also forgives zero-padding differences in the trailing page
// number ("p3" finds "p003" and vice versa). Returns null when nothing matches.
function csvLookup(csvMap, name) {
    if (csvMap[name]) return csvMap[name];
    var m = name.match(/^(.*?)(\d+)$/);
    if (!m) return null;
    var want = parseInt(m[2], 10);
    for (var key in csvMap) {
        var km = key.match(/^(.*?)(\d+)$/);
        if (km && km[1] === m[1] && parseInt(km[2], 10) === want) return csvMap[key];
    }
    return null;
}

function zeroPad(num, width) {
    var s = String(num);
    while (s.length < width) s = "0" + s;
    return s;
}

// CSV boxes for this document. A straight name match wins (someone OCR'd the
// spread as one image). Failing that, a name like "..._011-012" is assembled
// from the single-page rows "..._011" and "..._012": each page gets an equal
// share of the document width, and with SPREAD_RTL the first page sits on the
// RIGHT, so its boxes are shifted right by the width of the pages after it.
// The boxes come out in reading order - the order the txt lists the lines in
// under "Page 11-12:". Pages missing from the CSV contribute nothing, and the
// usual line-count mismatch check reports the shortfall.
function csvCoordsForDoc(csvMap, baseName, docW) {
    var direct = csvLookup(csvMap, baseName);
    if (direct) return direct;

    var m = baseName.match(/^(.*?)(\d+)\s*-\s*(\d+)$/);
    if (!m) return [];
    var prefix = m[1];
    var first = parseInt(m[2], 10);
    var last = parseInt(m[3], 10);
    if (isNaN(first) || isNaN(last) || last < first || last - first > 3) return []; // "2024-001" is a name, not a spread

    var count = last - first + 1;
    var pageW = docW / count;
    var out = [];
    var found = 0;
    for (var k = 0; k < count; k++) {
        var rows = csvLookup(csvMap, prefix + zeroPad(first + k, m[2].length));
        if (!rows) continue;
        found++;
        var offsetX = SPREAD_RTL ? docW - (k + 1) * pageW : k * pageW;
        for (var r = 0; r < rows.length; r++) {
            var b = rows[r];
            out.push({ startx: b.startx + offsetX, starty: b.starty, endx: b.endx + offsetX, endy: b.endy });
        }
    }
    return found ? out : [];
}

function getStyleNames() {
    var arr = [];
    for (var key in masterStyles) arr.push(key);
    return arr;
}

// Reads a style JSON from disk; returns the parsed object or throws.
// ExtendScript has no native JSON.parse, so eval is the standard approach. The
// leading-'{' check makes sure a random script renamed to .json can't execute
// code by accident.
function readStyleJson(file) {
    var content = "";
    try {
        file.open('r');
        content = file.read();
    } finally {
        try { file.close(); } catch(e) {}
    }
    content = content.replace(/^\uFEFF/, ''); // strip UTF-8 BOM
    if (!/^\s*\{/.test(content)) {
        throw new Error("File does not start with '{' - not a JSON object.");
    }
    var jsonStyles = eval("(" + content + ")");
    if (typeof jsonStyles !== "object" || jsonStyles === null) {
        throw new Error("JSON did not evaluate to an object.");
    }
    return jsonStyles;
}

// Looks for a style JSON sitting in the same folder as the script itself.
// Exactly one .json there = that's the project's style file, return it.
// Zero or several = return null: with several JSONs there's no way to guess
// which one is wanted, so the built-in styles stay and the user picks manually
// via "Load JSON...".
function findSiblingStyleJson() {
    try {
        var jsons = File($.fileName).parent.getFiles(function(f) {
            return f instanceof File && /\.json$/i.test(f.name);
        });
        return (jsons.length === 1) ? jsons[0] : null;
    } catch (e) {
        return null; // no usable script path (e.g. run from the ESTK console) - just skip
    }
}

function restoreUnits(ruler, type) {
    app.preferences.rulerUnits = ruler; 
    app.preferences.typeUnits = type; 
}

// ---------------------------------------------------------------------------
// Progress window (palette). A "palette" doesn't block script execution the
// way a "dialog" does, so it stays on screen while the batch runs. Photoshop
// only repaints it when win.update() is called, hence the call in every setter.
// ---------------------------------------------------------------------------
// modeMsg is decided once by the caller at batch start ("Using OCR pasting" /
// "Using grid pattern pasting") and never changes during the run.
function createProgressWindow(totalPages, modeMsg) {
    // no close button: killing the window mid-batch would just hide it and confuse things
    var w = new Window("palette", "Progress", undefined, {closeButton: false});
    w.orientation = "column";
    w.alignChildren = "left";
    w.margins = 16;

    // page counter and mode share one visual line: two statictexts in a row,
    // since a single statictext can't mix fonts/colors
    var topRow = w.add("group");
    topRow.orientation = "row";
    topRow.alignChildren = "bottom"; // rough baseline alignment for the two font sizes
    topRow.spacing = 8;

    var pageText = topRow.add("statictext", undefined, "Working on page 0/" + totalPages);
    pageText.preferredSize = [230, 18]; // fixed widths so text updates never trigger a relayout
    try { pageText.graphics.font = ScriptUI.newFont("dialog", ScriptUI.FontStyle.BOLD, 13); } catch (e) {}

    var modeText = topRow.add("statictext", undefined, modeMsg ? "(" + modeMsg + " - Esc stops)" : "(Esc stops)");
    modeText.preferredSize = [230, 16];
    try {
        modeText.graphics.font = ScriptUI.newFont("dialog", ScriptUI.FontStyle.REGULAR, 11);
        modeText.graphics.foregroundColor = modeText.graphics.newPen(modeText.graphics.PenType.SOLID_COLOR, [0.62, 0.62, 0.62], 1);
    } catch (e) {}

    var lineText = w.add("statictext", undefined, " ");
    lineText.preferredSize = [468, 18];
    try { lineText.graphics.foregroundColor = lineText.graphics.newPen(lineText.graphics.PenType.SOLID_COLOR, [0.62, 0.62, 0.62], 1); } catch (e) {}

    // bar + Cancel share a row, Unsmart-style
    var barGroup = w.add("group");
    barGroup.orientation = "row";
    barGroup.alignChildren = "center";
    var bar = barGroup.add("progressbar", undefined, 0, 100);
    bar.preferredSize = [190, 12];
    var pctText = barGroup.add("statictext", undefined, "0% Done");
    pctText.preferredSize = [90, 16]; // wide enough for "Closing in 15s" during the end countdown
    var btnCancel = barGroup.add("button", undefined, "Cancel");
    btnCancel.helpTip = "Stop after the current page (it's finished and saved first). Photoshop often doesn't deliver clicks to this window while a script is running - if nothing happens, press Esc: that stops right away and the page in flight is closed without saving.";
    btnCancel.onClick = function() {
        if (!g_progress) return;
        g_progress.cancelled = true;
        btnCancel.enabled = false;
        g_progress.lineText.text = "Cancelling - finishing this page first...";
        g_progress.win.update();
    };

    g_progress = { win: w, pageText: pageText, modeText: modeText, lineText: lineText, bar: bar, pctText: pctText, btnCancel: btnCancel, cancelled: false };
    w.show();
    w.update();
}

// resets the bar and preview for a fresh page
function progressSetPage(current, total) {
    if (!g_progress) return;
    g_progress.pageText.text = "Working on page " + current + "/" + total;
    g_progress.lineText.text = " ";
    g_progress.bar.value = 0;
    g_progress.pctText.text = "0% Done";
    g_progress.win.update();
}

// done = lines already finished on this page, total = lines on this page
function progressSetLine(rawLine, done, total) {
    if (!g_progress) return;
    if (g_progress.cancelled) {
        // don't let line previews overwrite the cancel notice while the page wraps up
        g_progress.lineText.text = "Cancelling - finishing this page first...";
    } else {
        var s = String(rawLine).replace(/\s+/g, " ");
        if (s.length > PROGRESS_PREVIEW_CHARS) s = s.substring(0, PROGRESS_PREVIEW_CHARS) + "...";
        g_progress.lineText.text = "Current line: \"" + s + "\"";
    }
    var pct = (total > 0) ? Math.round((done / total) * 100) : 100;
    g_progress.bar.value = pct;
    g_progress.pctText.text = pct + "% Done";
    g_progress.win.update();
}

// plain status message (skips, errors) without touching the bar
function progressNote(msg) {
    if (!g_progress) return;
    g_progress.lineText.text = msg;
    g_progress.win.update();
}

function progressFinishPage() {
    if (!g_progress) return;
    g_progress.bar.value = 100;
    g_progress.pctText.text = "100% Done";
    g_progress.win.update();
}

// Turns the progress window into the end-of-batch summary. With autoClose on,
// a countdown keeps the script alive (palettes vanish the moment the script
// exits) and then closes the window itself. With autoClose off, the window is
// left open for the caller's modal alert to keep alive; the finally in main()
// cleans it up afterwards.
function progressFinishBatch(pagesOK, totalPages, resultMsg, autoClose, stopped) {
    if (!g_progress) return;
    g_progress.pageText.text = (stopped ? "Stopped. Typeset " : "All done! Typeset ") + pagesOK + "/" + totalPages + " pages.";
    g_progress.lineText.text = resultMsg;
    g_progress.bar.value = 100;
    g_progress.pctText.text = "100% Done";
    // the batch is over either way; the button has nothing left to cancel
    try { g_progress.btnCancel.visible = false; } catch (e) {}
    g_progress.win.update();

    if (!autoClose) return;

    for (var s = DONE_AUTOCLOSE_SECONDS; s > 0; s--) {
        g_progress.pctText.text = "Closing in " + s + "s";
        g_progress.win.update();
        $.sleep(1000);
    }
    closeProgressWindow();
}

function closeProgressWindow() {
    if (!g_progress) return;
    try { g_progress.win.close(); } catch (e) {}
    g_progress = null;
}

// ---------------------------------------------------------------------------
// About dialog + link handling
// ---------------------------------------------------------------------------
function showAboutDialog() {
    var w = new Window("dialog", "About");
    w.orientation = "column";
    w.alignChildren = "center";
    w.margins = 20;
    w.spacing = 8;

    var title = w.add("statictext", undefined, "Auto Insert Txt to Comic");
    try { title.graphics.font = ScriptUI.newFont("dialog", ScriptUI.FontStyle.BOLD, 16); } catch (e) {}

    var ver = w.add("statictext", undefined, "v" + SCRIPT_VERSION + "  -  by Luigi / Plastic Tears");
    try { ver.graphics.foregroundColor = ver.graphics.newPen(ver.graphics.PenType.SOLID_COLOR, [0.62, 0.62, 0.62], 1); } catch (e) {}

    addLinkText(w, "plastictears.com", URL_SITE, [0.35, 0.62, 1.0]);
    addLinkText(w, "GitHub Source Code", URL_GITHUB, [0.35, 0.62, 1.0]);

    var credits = w.add("panel", undefined, "Credits");
    credits.alignChildren = "center";
    credits.margins = 14;
    credits.spacing = 6;
    addLinkText(credits, "Inspired by Insert Txt to Comic", "https://github.com/pespositotlr/insert-txt-text-to-comic/", [0.55, 0.68, 0.85]);
    addLinkText(credits, "Auto-centering based on TypeR by ScanR", "https://github.com/ScanR/TypeR", [0.55, 0.68, 0.85]);

    w.add("button", undefined, "Close", {name: "ok"});
    w.show();
}

// statictext dressed up as a hyperlink: colored, URL in the tooltip, opens on click
function addLinkText(parent, label, url, rgb) {
    var st = parent.add("statictext", undefined, label);
    st.helpTip = url;
    try { st.graphics.foregroundColor = st.graphics.newPen(st.graphics.PenType.SOLID_COLOR, rgb, 1); } catch (e) {}
    st.addEventListener("mousedown", function () { openURL(url); });
    return st;
}

// ScriptUI has no way to open a browser directly, so this writes a tiny shortcut
// file to the temp folder and lets the OS execute it with the default browser.
function openURL(url) {
    try {
        if (File.fs === "Windows") {
            var f = new File(Folder.temp + "/pt_open_link.url");
            f.open("w");
            f.write("[InternetShortcut]\r\nURL=" + url + "\r\n");
            f.close();
            f.execute();
        } else {
            // macOS: a self-redirecting html opens in the default browser
            var f2 = new File(Folder.temp + "/pt_open_link.html");
            f2.open("w");
            f2.write('<html><head><meta http-equiv="refresh" content="0; url=' + url + '"></head></html>');
            f2.close();
            f2.execute();
        }
    } catch (e) {
        alert("Could not open the link automatically. Here it is:\n\n" + url);
    }
}

// Typesets the currently open document: finds its page block in the txt, works
// out which speaker carries over from earlier pages, then places every line
// using CSV coordinates when available or the fallback grid when not.
function processPage(data, origDPI, csvMap, mismatchLogs) {
    var doc = activeDocument;

    var pages = data.split(/\r?\n\r?\n/);
    var pageIdx = getCurrentPageNumberIndex(pages);
    if (pageIdx < 0) {
        // Previously this was a silent skip — the doc got resized/saved with no text
        // and no trace in the log. Now it shows up in the mismatch log.
        mismatchLogs.push("Doc: " + doc.name + "\n-> No matching page found in the translation txt (skipped).");
        progressNote("No matching page in txt - skipped.");
        return;
    }

    // walk every page before this one to find the last named speaker, so
    // continuation lines at the top of this page inherit the right one
    var lastSpeaker = "";
    for (var p = 0; p < pageIdx; p++) {
        var prevLines = pages[p].split(/\r?\n/);
        for (var l = 0; l < prevLines.length; l++) {
            var lineStr = prevLines[l].replace(/\[.*?\]/g, "").replace(/^\s+|\s+$/g,'');
            if (pageMarkerLineRegex.test(lineStr)) continue; // "Page 1:" is not a speaker
            var carryTag = splitSpeakerTag(lineStr);
            if (carryTag && !carryTag.speaker.match(exclusionRegex)) {
                lastSpeaker = carryTag.speaker;
            }
        }
    }

    var lines = constructLineObjectsForPage(pages[pageIdx].split(/\r?\n/), lastSpeaker);
    var textGroup;
    try { textGroup = doc.layerSets.getByName("Text"); }
    catch (e) {
        rethrowIfCancel(e);
        textGroup = doc.layerSets.add();
        textGroup.name = "Text";
    }
    // A new layer is created on top of the selected one, and with a group selected
    // it goes on top INSIDE the group. So selecting "Text" once puts every layer of
    // the page where v1.4 moved them one at a time (newest line on top).
    selectLayerById(textGroup.id);

    // the document facts every layer needs, read once instead of once per layer
    var pg = {
        w: doc.width.value,
        h: doc.height.value,
        gray: doc.mode === DocumentMode.GRAYSCALE,
        rgb: doc.mode === DocumentMode.RGB
    };

    var scaleFactor = origDPI / 72;
    var baseName = normalizeDocName(doc.name);

    var pageCsvCoords = csvCoordsForDoc(csvMap, baseName, pg.w);
    var hasCsvData = pageCsvCoords.length > 0;
    
    // count dialogue vs. note lines up front so the grid knows its real total
    var numValid = 0;
    var numExcluded = 0;

    for (var i = 0; i < lines.length; i++) {
        if (lines[i].speaker.match(exclusionRegex)) {
            numExcluded++;
        } else {
            numValid++;
        }
    }

    if (hasCsvData && numValid !== pageCsvCoords.length) {
        mismatchLogs.push("Doc: " + baseName + "\n-> Txt has " + numValid + " dialogue lines, but CSV has " + pageCsvCoords.length + " coordinate boxes.");
    }

    // the grid holds every note line, plus any dialogue overflow if the CSV runs short
    var totalGridItems = numExcluded + (hasCsvData ? Math.max(0, numValid - pageCsvCoords.length) : numValid);

    var csvIdx = 0;
    var gridIdx = 0;

    for (var i = 0; i < lines.length; i++) {
        // i = lines already finished, so the bar shows completed work while the
        // preview shows the line currently being placed
        progressSetLine(lines[i].line, i, lines.length);

        var speakerKey = lines[i].speaker;
        var styleArr = lookupStyle(speakerKey);

        var fontSize, fontHex;
        
        // style arrays come in two shapes, [font, size, hex] or [font, hex], so sniff by type
        fontHex = (styleArr.length >= 2 && typeof styleArr[styleArr.length - 1] === 'string') ? styleArr[styleArr.length - 1] : "000000";
        var hasHardcodedSize = (styleArr.length >= 2 && typeof styleArr[1] === 'number');
        
        if (g_useSmartSizing) {
            if (hasHardcodedSize && !g_forceSmartSizing) {
                fontSize = styleArr[1] * scaleFactor;
            } else {
                var basePt = calculateSmartSize(lines[i].line);
                fontSize = basePt * scaleFactor;
            }
        } else {
            if (hasHardcodedSize) {
                fontSize = styleArr[1] * scaleFactor;
            } else {
                fontSize = 14 * scaleFactor; 
            }
        }

        var isExcluded = speakerKey.match(exclusionRegex) !== null;
        var placement = {};

        // dialogue lines consume CSV boxes in order; notes and any overflow go to the grid
        if (!isExcluded && hasCsvData && csvIdx < pageCsvCoords.length) {
            placement = { type: 'csv', coords: pageCsvCoords[csvIdx] };
            csvIdx++;
        } else {
            placement = { type: 'grid', index: gridIdx, total: totalGridItems };
            gridIdx++;
        }

        createTypesetLayer(lines[i].line, styleArr[0], fontSize, fontHex, placement, speakerKey, pg);
    }

    progressFinishPage();
}

// Style for a speaker tag: the exact key first, then the same key in any letter
// case (translators type "Sfx:" or "handwritten:", and the SFX / point-text /
// bouncy checks already ignore case), then "default", then Arial so the run
// stays alive.
function lookupStyle(speakerKey) {
    var styles = activeProjectStyle;
    if (styles.hasOwnProperty(speakerKey) && styles[speakerKey]) return styles[speakerKey];
    var wanted = String(speakerKey).toLowerCase();
    for (var key in styles) {
        if (styles.hasOwnProperty(key) && styles[key] && key.toLowerCase() === wanted) return styles[key];
    }
    if (styles.hasOwnProperty("default") && styles["default"]) return styles["default"];
    return ["Arial-Regular", "000000"];
}

// Character count -> font size, interpolated linearly between MAX_PT and MIN_PT.
// Markdown delimiters and whitespace don't count (literal asterisks like censor bars
// do), lines that are pure punctuation ("!?",
// "...") always get the max size, and the result snaps to SIZE_STEP.
function calculateSmartSize(text) {
    var cleanText = parseMarkdown(text).text.replace(/\s+/g, "");
    if (/^[\.\?\!\u00bf\u00a1]+$/.test(cleanText)) return MAX_PT;

    var charCount = cleanText.length;
    if (charCount < MIN_CHAR) charCount = MIN_CHAR;
    if (charCount > MAX_CHAR) charCount = MAX_CHAR;

    var t = (charCount - MIN_CHAR) / (MAX_CHAR - MIN_CHAR);
    var rawSize = MAX_PT + (MIN_PT - MAX_PT) * t;

    return Math.round(rawSize / SIZE_STEP) * SIZE_STEP;
}

// Creates and fully dresses one text layer: font, size, color, placement (CSV box
// or grid cell), markdown and quote styling, leading and OpenType features all go
// into a single Action Manager "make" (see makeTextLayer), then come the extras -
// centring on the OCR box, stroke, and point text + bounce for SFX speakers.
// Up to v1.4 every one of those properties was its own textItem set, and each set
// made Photoshop lay the text out again: ~4s per layer on a 1200px page, most of
// a chapter's run time. Now everything is worked out in plain JS first and
// Photoshop builds the layer once.
function createTypesetLayer(rawContent, styleString, fontSize, hexColor, placement, speakerKey, pg) {
    var docW = pg.w;
    var docH = pg.h;
    var isSpread = docW > docH;

    // strip bracket tags and spaces to get the PostScript name; assume Regular when no style is given
    var fontPart = styleString.split(" [")[0];
    var cleanFont = fontPart.replace(/\s+/g, "");
    if (cleanFont.indexOf("-") === -1) cleanFont += "-Regular";
    var fontRoot = cleanFont.split("-")[0]; // markdown/quote faces are "<root>-Italic" etc.
    var baseFont = resolveFont(cleanFont);
    if (!baseFont) noteMissingFont(cleanFont, speakerKey, "that text used Photoshop's default font (Myriad Pro) instead");

    // Sanitize: strip anything that isn't a hex digit, fall back to black if not a clean 6-char value
    var safeHex = String(hexColor).replace(/[^0-9a-fA-F]/g, "");
    if (safeHex.length !== 6) safeHex = "000000";
    // grayscale pages only ever get black or white text
    if (pg.gray) safeHex = (safeHex.toLowerCase() === "ffffff") ? "ffffff" : "000000";
    var rgb = [parseInt(safeHex.substring(0, 2), 16), parseInt(safeHex.substring(2, 4), 16), parseInt(safeHex.substring(4, 6), 16)];

    var vMatch = styleString.match(/V(\d+)/i);
    var hMatch = styleString.match(/H(\d+)/i);
    var lMatch = styleString.match(/L(\d+)/i);
    var look = {
        size: fontSize,
        rgb: rgb,
        caps: styleString.toUpperCase().indexOf("CAPS") > -1,
        vScale: vMatch ? parseInt(vMatch[1]) : 100,
        hScale: hMatch ? parseInt(hMatch[1]) : 100,
        leading: lMatch ? parseInt(lMatch[1]) / 100 : null
    };

    // only real markdown delimiters come out; censor bars and note markers stay
    var parsed = parseMarkdown(rawContent);
    var text = parsed.text;
    // the dark red is for coloured text on colour pages; plain black or white stays put
    var plain = (rgb[0] <= 10 && rgb[1] <= 10 && rgb[2] <= 10) || (rgb[0] >= 245 && rgb[1] >= 245 && rgb[2] >= 245);
    var useRed = pg.rgb && !plain;
    var ranges = (g_useMarkdown && rawContent.indexOf("*") !== -1)
        ? markdownRanges(parsed, baseFont, fontRoot, speakerKey, MARKDOWN_BOLDITALIC_RED && useRed)
        : [{ from: 0, to: text.length, font: baseFont, root: fontRoot, red: false }];

    if (g_useBoldQuotes) {
        var quoted = applyQuoteRanges(text, ranges, useRed, speakerKey);
        text = quoted.text;
        ranges = quoted.ranges;
    }

    var box;
    if (placement.type === 'csv') {
        var rawW = placement.coords.endx - placement.coords.startx;
        var rawH = placement.coords.endy - placement.coords.starty;

        // "minimum bubble size" to prevent having super thin bubbles, based on doc width
        var minPct = isSpread ? 0.06 : 0.12; // 6% for spreads, 12% for single pages (same width in px: a spread is twice as wide)
        var minWidthPx = docW * minPct;

        var cx = placement.coords.startx + (rawW / 2);
        var finalW = (rawW < minWidthPx) ? minWidthPx : rawW;
        box = { x: cx - (finalW / 2), y: placement.coords.starty, w: finalW, h: rawH };

    } else {
        var index = placement.index;
        var total = placement.total;

        var rows = 4; // the grid is always 4 rows tall
        var minCols = isSpread ? 8 : 4; // Base minimum vertical columns

        // Smart column calculation: Total divided by rows, rounded up.
        // If we have 20 items: Math.ceil(20 / 4) = 5 columns.
        var requiredCols = Math.ceil(total / rows);

        // Use whichever is larger: the default minimum or the newly calculated required columns.
        var cols = Math.max(minCols, requiredCols);

        var colWidth = docW / cols;
        var rowHeight = docH / rows;

        var curCol = index % cols;
        var curRow = Math.floor(index / cols); // no '% rows' cap: the grid grows downward when there are many lines

        // columns fill right to left to match manga reading order
        box = {
            x: docW - ((curCol + 1) * colWidth) + (colWidth * 0.1),
            y: (curRow * rowHeight) + (rowHeight * 0.1),
            w: colWidth * 0.8,
            h: rowHeight * 0.8
        };
    }

    var layerId = makeTextLayer(text, ranges, box, look, pg);

    // Centre the glyphs on the OCR box. Up to v1.3.5 this first marqueed the box
    // and ran a TypeR-style expand/contract pass over it (up to 17 selection ops
    // per bubble), but a marquee of a rectangle is symmetric about its own centre,
    // so no amount of expanding/contracting could move that centre - and on boxes
    // under 60px the passes collapsed the selection and the nudge was skipped.
    // Same target, computed directly, to the nearest whole pixel (see
    // translateTargetLayer): the centre can be up to half a pixel off the box's.
    if (placement.type === 'csv') {
        try {
            var boxMidX = (placement.coords.startx + placement.coords.endx) / 2;
            var boxMidY = (placement.coords.starty + placement.coords.endy) / 2;

            var lBnd = targetLayerBounds();
            var layMidX = (lBnd[0] + lBnd[2]) / 2;
            var layMidY = (lBnd[1] + lBnd[3]) / 2;

            var dx = Math.round(boxMidX - layMidX);
            var dy = Math.round(boxMidY - layMidY);
            if (dx !== 0 || dy !== 0) translateTargetLayer(dx, dy);
        } catch(e) { rethrowIfCancel(e); }
    }

    var hasStroke = (styleString.toUpperCase().indexOf("STROKE") > -1);
    if (hasStroke && g_useStroke) {
        applyInvertedStrokeAction(rgb, docH);
    }

    // SFX-style speakers get converted to point text now that placement is done
    if (speakerKey && pointTextRegex.test(speakerKey)) {
        try {
            convertTargetToPointText();
        } catch(e) { rethrowIfCancel(e); } // some layer states refuse the conversion; paragraph text is a fine fallback
    }

    if (g_useBouncySFX && speakerKey && bouncyRegex.test(speakerKey)) {
        try { applyBouncySFX(layerId); } catch(e) { rethrowIfCancel(e); } // cosmetic pass - never let it kill the run
    }
}

// Markdown spans become font swaps inside the layer: *italic*, **bold** and
// ***bold-italic*** take the "-Italic" / "-Bold" / "-BoldItalic" face of the same
// family, and the text around them keeps the base font. ***bold-italic*** is also
// dark red when `boldItalicRed` is set (see MARKDOWN_BOLDITALIC_RED). Ranges are plain
// { from, to, font, root, red } objects until makeTextLayer turns them into styles.
function markdownRanges(parsed, baseFont, fontRoot, speakerKey, boldItalicRed) {
    var ranges = [];
    var pos = 0;
    for (var i = 0; i < parsed.spans.length; i++) {
        var span = parsed.spans[i];
        if (span.start > pos) {
            ranges.push({ from: pos, to: span.start, font: baseFont, root: fontRoot, red: false });
        }

        var targetSuffix = "";
        if (span.type === "Bold") targetSuffix = boldSuffix;
        if (span.type === "Italic") targetSuffix = italicSuffix;
        if (span.type === "BoldItalic") targetSuffix = boldItalicSuffix;

        ranges.push({ from: span.start, to: span.end, font: variantFont(fontRoot + targetSuffix, speakerKey), root: fontRoot,
                      red: !!boldItalicRed && span.type === "BoldItalic" });
        pos = span.end;
    }
    if (pos < parsed.text.length) {
        ranges.push({ from: pos, to: parsed.text.length, font: baseFont, root: fontRoot, red: false });
    }
    return ranges;
}

// Restyles quoted spans bold-italic (and dark red when `red` is set). The quote
// takes its family from the range it starts in, and the ranges outside the quotes
// are carried over untouched, so markdown styling on the rest of the line
// survives. With "Remove Quotes" the marks go and later ranges shift left.
function applyQuoteRanges(contents, ranges, red, speakerKey) {
    var matches = findQuoteSpans(contents);
    if (matches.length === 0) return { text: contents, ranges: ranges };

    // slice the string into quoted / plain runs so untouched text keeps its exact styling
    var segments = [];
    var cursor = 0;
    for (var j = 0; j < matches.length; j++) {
        var match = matches[j];
        if (cursor < match.start) {
            segments.push({ start: cursor, end: match.start, isBold: false });
        }
        segments.push({ start: match.start, end: match.end, isBold: true, innerText: match.innerText });
        cursor = match.end;
    }
    if (cursor < contents.length) {
        segments.push({ start: cursor, end: contents.length, isBold: false });
    }

    var newContents = "";
    var out = [];
    for (j = 0; j < segments.length; j++) {
        var seg = segments[j];
        var newPos = newContents.length;

        if (!seg.isBold) {
            newContents += contents.substring(seg.start, seg.end);
            // every range overlapping this run, shifted to where the run now starts
            for (var r = 0; r < ranges.length; r++) {
                var from = Math.max(ranges[r].from, seg.start);
                var to = Math.min(ranges[r].to, seg.end);
                if (from >= to) continue;
                out.push({ from: newPos + (from - seg.start), to: newPos + (to - seg.start),
                           font: ranges[r].font, root: ranges[r].root, red: ranges[r].red });
            }
        } else {
            var displayText = g_removeQuotes ? seg.innerText : contents.substring(seg.start, seg.end);
            newContents += displayText;
            var base = rangeAt(ranges, seg.start);
            out.push({ from: newPos, to: newPos + displayText.length,
                       font: variantFont(base.root + quoteitalicsuff, speakerKey), root: base.root, red: red });
        }
    }

    // a line that was nothing but empty quotes would come out as an empty layer
    if (newContents.length === 0) return { text: contents, ranges: ranges };
    return { text: newContents, ranges: out };
}

// Quoted spans in a line, in order, overlaps dropped (the earlier one wins).
// Double quotes and guillemets always count; single quotes only when the quoted
// text ends in punctuation, so apostrophes don't trigger it.
function findQuoteSpans(contents) {
    var matches = [];
    // straight quotes, curly quotes, and guillemets
    var doubleRegex = /(["\u201c\u201d\u00ab\u00bb])([\s\S]*?)(["\u201c\u201d\u00ab\u00bb])/g;
    var m;
    while ((m = doubleRegex.exec(contents)) !== null) {
        matches.push({ start: m.index, end: doubleRegex.lastIndex, innerText: m[2] });
    }

    // single-quoted spans that end in punctuation; the lookahead skips apostrophe
    // words like 'em, 'cause, 'ya so they don't trigger styling
    var singleRegex = /(^|[\s,;:!?\(\[\-])(['\u2018\u2019\u201a\u201b])(?!em\b|cause\b|nothin\b|ya\b)([\s\S]*?[.,!?\-\u2026]+)(['\u2018\u2019\u201a\u201b])(?=$|[\s\)\]\-.,!?;:\u2026])/gi;
    while ((m = singleRegex.exec(contents)) !== null) {
        var actualStart = m.index + m[1].length;
        matches.push({
            start: actualStart,
            end: actualStart + m[2].length + m[3].length + m[4].length,
            innerText: m[3]
        });
    }

    matches.sort(function(a, b) { return a.start - b.start; });

    // when matches overlap, keep whichever starts first and drop the rest
    var filtered = [];
    var current = null;
    for (var j = 0; j < matches.length; j++) {
        if (current && matches[j].start < current.end) continue;
        current = matches[j];
        filtered.push(current);
    }
    return filtered;
}

// The range covering a character position, falling back to the last range when
// the position lands past the end of every range.
function rangeAt(ranges, pos) {
    for (var i = 0; i < ranges.length; i++) {
        if (pos >= ranges[i].from && pos < ranges[i].to) return ranges[i];
    }
    return ranges[ranges.length - 1];
}

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

// Installed PostScript name for a requested one, or null when there's no such
// face. The exact name wins; failing that, the same family and style, reading
// "Family-Style" as family "Family" + style "Style". That second step is for faces
// whose PostScript names use their own suffixes: a style asking for
// "CCLegendaryLegerdemainLeggy" means "...Leggy-Regular", but the face is
// installed as "...Leggy-Reg" (and its italic as "-Ita", bold "-Bd", Arial as
// "ArialMT"). Up to v1.4 such a font silently came out as Myriad Pro.
function resolveFont(psName) {
    if (g_fonts === null) {
        try { g_fonts = loadFontIndex(); }
        catch (e) {
            rethrowIfCancel(e);
            g_fonts = { ps: {}, face: {}, askByName: true };
        }
    }
    var key = "#" + psName; // "#" so a font named like an Object member can't collide
    if (g_fonts.askByName && g_fonts.ps[key] === undefined) {
        // no font list to search: ask Photoshop about this one name, and remember
        try { app.fonts.getByName(psName); g_fonts.ps[key] = true; }
        catch (e2) { rethrowIfCancel(e2); g_fonts.ps[key] = false; }
    }
    if (g_fonts.ps[key]) return psName;

    var dash = psName.lastIndexOf("-");
    if (dash > 0) {
        var face = g_fonts.face["#" + faceKey(psName.substring(0, dash), psName.substring(dash + 1))];
        if (face) return face;
    }
    return null;
}

// Photoshop's whole font list in one call (~30ms for 4000 fonts), indexed by
// exact PostScript name and by family + style name.
function loadFontIndex() {
    var index = { ps: {}, face: {}, askByName: false };
    var ref = new ActionReference();
    ref.putProperty(sid("property"), sid("fontList"));
    ref.putEnumerated(sid("application"), sid("ordinal"), sid("targetEnum"));
    var list = executeActionGet(ref).getObjectValue(sid("fontList"));
    var names = list.getList(sid("fontPostScriptName"));
    var families = list.getList(sid("fontFamilyName"));
    var styles = list.getList(sid("fontStyleName"));
    for (var i = 0; i < names.count; i++) {
        var name = names.getString(i);
        index.ps["#" + name] = true;
        var face = "#" + faceKey(families.getString(i), styles.getString(i));
        if (!index.face[face]) index.face[face] = name;
    }
    return index;
}

// "Nerves of Steel BB" + "Bold Italic" and "NervesofSteelBB" + "BoldItalic" both
// come out as "nervesofsteelbb|bolditalic"
function faceKey(family, style) {
    return (family + "|" + style).replace(/\s+/g, "").toLowerCase();
}

// A markdown or quote face ("<root>-Italic"). When it isn't installed it's still
// requested, as in v1.4 - the span shows up as a missing font in Photoshop, which
// is easy to spot and fix - and the log says which font it was.
function variantFont(psName, speakerKey) {
    var found = resolveFont(psName);
    if (found) return found;
    noteMissingFont(psName, speakerKey, "styled spans show as a missing font");
    return psName;
}

// one log line per missing font per batch, naming the first speaker that wanted it
function noteMissingFont(psName, speakerKey, consequence) {
    if (g_fontWarned["#" + psName]) return;
    g_fontWarned["#" + psName] = true;
    g_fontWarnings.push("- \"" + psName + "\" is not installed (first wanted by speaker \"" + speakerKey + "\"): " + consequence + ".");
}

// ---------------------------------------------------------------------------
// Action Manager helpers for the text layer
// ---------------------------------------------------------------------------

// stringIDToTypeID is a round trip into Photoshop, and one layer's descriptor
// needs a few dozen IDs, so they're cached. The typeof check keeps a name that
// collides with an Object.prototype member ("constructor") from returning a function.
function sid(s) {
    var id = g_sid[s];
    if (typeof id !== "number") {
        id = stringIDToTypeID(s);
        g_sid[s] = id;
    }
    return id;
}

// Creates the whole text layer in one "make": contents, box and position, every
// character style range and the paragraph style (centred, Latin/CJK composer, no
// hyphenation, auto-leading when the style has [L##]). The new layer lands on top
// of the selected one (see processPage) and is left selected. Returns its ID.
function makeTextLayer(text, ranges, box, look, pg) {
    var layer = new ActionDescriptor();
    layer.putString(sid("textKey"), text);

    // paragraph text: the box's top-left corner sits on the click point
    var click = new ActionDescriptor();
    click.putUnitDouble(sid("horizontal"), sid("percentUnit"), box.x / pg.w * 100);
    click.putUnitDouble(sid("vertical"), sid("percentUnit"), box.y / pg.h * 100);
    layer.putObject(sid("textClickPoint"), sid("paint"), click);
    layer.putEnumerated(sid("antiAlias"), sid("antiAliasType"), sid("antiAliasSmooth"));

    var bounds = new ActionDescriptor();
    bounds.putDouble(sid("top"), 0);
    bounds.putDouble(sid("left"), 0);
    bounds.putDouble(sid("bottom"), box.h);
    bounds.putDouble(sid("right"), box.w);
    var shape = new ActionDescriptor();
    shape.putEnumerated(sid("char"), sid("char"), sid("box"));
    shape.putEnumerated(sid("orientation"), sid("orientation"), sid("horizontal"));
    shape.putObject(sid("bounds"), sid("rectangle"), bounds);
    var shapes = new ActionList();
    shapes.putObject(sid("textShape"), shape);
    layer.putList(sid("textShape"), shapes);

    // Photoshop 2019 refuses a text layer with no style range at all
    var styleList = new ActionList();
    for (var i = 0; i < ranges.length; i++) {
        if (ranges[i].to <= ranges[i].from) continue;
        var range = new ActionDescriptor();
        range.putInteger(sid("from"), ranges[i].from);
        range.putInteger(sid("to"), ranges[i].to);
        range.putObject(sid("textStyle"), sid("textStyle"), buildTextStyle(look, ranges[i].font, ranges[i].red, pg));
        styleList.putObject(sid("textStyleRange"), range);
    }
    layer.putList(sid("textStyleRange"), styleList);

    var paraRange = new ActionDescriptor();
    paraRange.putInteger(sid("from"), 0);
    paraRange.putInteger(sid("to"), text.length);
    paraRange.putObject(sid("paragraphStyle"), sid("paragraphStyle"), buildParagraphStyle(look));
    var paraList = new ActionList();
    paraList.putObject(sid("paragraphStyleRange"), paraRange);
    layer.putList(sid("paragraphStyleRange"), paraList);

    var make = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putClass(sid("textLayer"));
    make.putReference(sid("null"), ref);
    make.putObject(sid("using"), sid("textLayer"), layer);
    var result = executeAction(sid("make"), make, DialogModes.NO);
    if (result.hasKey(sid("layerID"))) return result.getInteger(sid("layerID"));
    return targetLayerId();
}

// One character style: what v1.4 set piecemeal through textItem (font, size,
// colour, caps, scale, optical kerning, the Spanish dictionary) plus the OpenType
// extras comic fonts rely on for things like crossbar-I substitution. font null =
// Photoshop's default font, which is what a failed font set left in v1.4.
function buildTextStyle(look, font, red, pg) {
    var ts = new ActionDescriptor();
    if (font) ts.putString(sid("fontPostScriptName"), font);
    ts.putUnitDouble(sid("size"), sid("pixelsUnit"), look.size);
    var color = red ? quoteRedDesc() : colorDesc(pg, look.rgb);
    ts.putObject(sid("color"), color.type, color.desc);
    // the colour a textItem-made layer carried for its (unused) character stroke
    var black = colorDesc(pg, [0, 0, 0]);
    ts.putObject(sid("strokeColor"), black.type, black.desc);
    ts.putEnumerated(sid("fontCaps"), sid("fontCaps"), look.caps ? sid("allCaps") : sid("normal"));
    ts.putDouble(sid("verticalScale"), look.vScale);
    ts.putDouble(sid("horizontalScale"), look.hScale);
    ts.putEnumerated(sid("autoKern"), sid("autoKern"), sid("opticalKern"));
    ts.putEnumerated(sid("textLanguage"), sid("textLanguage"), sid("spanishLanguage")); // English is englishLanguage
    ts.putBoolean(sid("autoLeading"), true);
    ts.putBoolean(sid("contextualLigatures"), true);
    ts.putBoolean(sid("connectionForms"), true);
    ts.putBoolean(sid("altligature"), true);
    ts.putBoolean(sid("ordinals"), true);
    ts.putBoolean(sid("stylisticAlternates"), true);
    ts.putBoolean(sid("fractions"), true);
    return ts;
}

// The paragraph style, spelled out in full. Any key left out of a "make" doesn't
// come from the Paragraph panel the way textItem-made layers got theirs: it comes
// from Photoshop's factory defaults (every-line composer, standard burasagari),
// which breaks lines differently. These are the values v1.4's layers ended up
// with: centred, Latin/CJK single-line composer, no hyphenation, no indents.
function buildParagraphStyle(look) {
    var ps = new ActionDescriptor();
    ps.putEnumerated(sid("align"), sid("alignmentType"), sid("center"));
    if (look.leading !== null) ps.putDouble(sid("autoLeadingPercentage"), look.leading);
    ps.putEnumerated(sid("textComposerEngine"), sid("textComposerEngine"), sid("textLatinCJKComposer"));
    ps.putBoolean(sid("textEveryLineComposer"), false);
    ps.putBoolean(sid("hyphenate"), false);
    ps.putBoolean(sid("hangingRoman"), false);
    ps.putEnumerated(sid("burasagari"), sid("burasagari"), sid("burasagariNone"));
    ps.putEnumerated(sid("preferredKinsokuOrder"), sid("preferredKinsokuOrder"), sid("pushIn"));
    ps.putEnumerated(sid("leadingType"), sid("leadingType"), sid("leadingBelow"));
    ps.putEnumerated(sid("directionType"), sid("directionType"), sid("dirLeftToRight"));
    ps.putEnumerated(sid("kashidaWidthType"), sid("kashidaWidthType"), sid("kashidaWidthMedium"));
    ps.putUnitDouble(sid("firstLineIndent"), sid("pixelsUnit"), 0);
    ps.putUnitDouble(sid("startIndent"), sid("pixelsUnit"), 0);
    ps.putUnitDouble(sid("endIndent"), sid("pixelsUnit"), 0);
    ps.putUnitDouble(sid("spaceBefore"), sid("pixelsUnit"), 0);
    ps.putUnitDouble(sid("spaceAfter"), sid("pixelsUnit"), 0);
    ps.putDouble(sid("justificationWordMinimum"), 0.80000001192093);
    ps.putDouble(sid("justificationWordDesired"), 1);
    ps.putDouble(sid("justificationWordMaximum"), 1.33000004291534);
    ps.putDouble(sid("justificationLetterMinimum"), 0);
    ps.putDouble(sid("justificationLetterDesired"), 0);
    ps.putDouble(sid("justificationLetterMaximum"), 0);
    ps.putDouble(sid("justificationGlyphMinimum"), 1);
    ps.putDouble(sid("justificationGlyphDesired"), 1);
    ps.putDouble(sid("justificationGlyphMaximum"), 1);
    return ps;
}

// Colour in the document's own model, the way a SolidColor handed to textItem
// ended up: grayscale pages store % of black ink (only black or white get here),
// everything else RGB. ("grain" is Photoshop's name for the green key; "green"
// maps to the same ID.)
function colorDesc(pg, rgb) {
    var c = new ActionDescriptor();
    if (pg.gray) {
        c.putDouble(sid("gray"), (rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255) ? 0 : 100);
        return { type: sid("grayscale"), desc: c };
    }
    c.putDouble(sid("red"), rgb[0]);
    c.putDouble(sid("grain"), rgb[1]);
    c.putDouble(sid("blue"), rgb[2]);
    return { type: sid("RGBColor"), desc: c };
}

// the dark red for quoted spans (QUOTE_RED_* up top)
function quoteRedDesc() {
    var c = new ActionDescriptor();
    c.putDouble(sid("red"), QUOTE_RED_R);
    c.putDouble(sid("grain"), QUOTE_RED_G);
    c.putDouble(sid("blue"), QUOTE_RED_B);
    return { type: sid("RGBColor"), desc: c };
}

function selectLayerById(id) {
    var d = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putIdentifier(sid("layer"), id);
    d.putReference(sid("null"), ref);
    d.putBoolean(sid("makeVisible"), false);
    executeAction(sid("select"), d, DialogModes.NO);
}

function targetLayerId() {
    var ref = new ActionReference();
    ref.putProperty(sid("property"), sid("layerID"));
    ref.putEnumerated(sid("layer"), sid("ordinal"), sid("targetEnum"));
    return executeActionGet(ref).getInteger(sid("layerID"));
}

// pixel bounds of the selected layer as [left, top, right, bottom]
function targetLayerBounds() {
    var ref = new ActionReference();
    ref.putProperty(sid("property"), sid("bounds"));
    ref.putEnumerated(sid("layer"), sid("ordinal"), sid("targetEnum"));
    var b = executeActionGet(ref).getObjectValue(sid("bounds"));
    return [b.getUnitDoubleValue(sid("left")), b.getUnitDoubleValue(sid("top")),
            b.getUnitDoubleValue(sid("right")), b.getUnitDoubleValue(sid("bottom"))];
}

// Moves the selected layer by whole pixels. A "move" only goes in whole pixels
// and costs ~30ms; keeping the half pixels (what layer.translate() did in v1.4,
// and a transform does in v1.5) cost ~200ms per bubble, for a difference nobody
// can see on a layer that gets hand-adjusted anyway.
function translateTargetLayer(dx, dy) {
    var d = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putEnumerated(sid("layer"), sid("ordinal"), sid("targetEnum"));
    d.putReference(sid("null"), ref);
    var offset = new ActionDescriptor();
    offset.putUnitDouble(sid("horizontal"), sid("pixelsUnit"), dx);
    offset.putUnitDouble(sid("vertical"), sid("pixelsUnit"), dy);
    d.putObject(sid("to"), sid("offset"), offset);
    executeAction(sid("move"), d, DialogModes.NO);
}

// Type > Convert to Point Text on the selected layer: the glyphs stay where the
// box laid them out, with a hard break wherever the box wrapped a line
function convertTargetToPointText() {
    var d = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putProperty(charIDToTypeID("Prpr"), charIDToTypeID("TEXT"));
    ref.putEnumerated(charIDToTypeID("TxLr"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    d.putReference(charIDToTypeID("null"), ref);
    d.putEnumerated(charIDToTypeID("T   "), charIDToTypeID("TEXT"), charIDToTypeID("Pnt "));
    executeAction(charIDToTypeID("setd"), d, DialogModes.NO);
}

// Markdown-like emphasis: *italic*, **bold**, ***bold-italic***. Finds the asterisk
// runs that really are delimiters and returns the line with those stripped, plus the
// spans to restyle (positions in the returned text). Rules, so that censorship and
// note markers survive untouched:
//  - a delimiter is a run of exactly 1, 2 or 3 asterisks; 4+ ("****Tok") is literal
//  - opener and closer must be the same length, the opener hugs the text on its
//    right and the closer hugs it on its left ("* x *" is not a span)
//  - the span needs at least one non-space character and no asterisks inside
//  - a closer run longer than the opener uses only what it needs, the rest stays
//    as text ("*Pachinko** is" = italic Pachinko + a note marker)
// Anything that doesn't pair up ("Pachinko*", a bare "***", "from ****, crazy")
// stays in the text exactly as written.
function parseMarkdown(raw) {
    var s = String(raw);
    var runs = []; // every asterisk run in the line, as { start, len }
    var i = 0;
    while (i < s.length) {
        if (s.charAt(i) !== "*") { i++; continue; }
        var j = i;
        while (j < s.length && s.charAt(j) === "*") j++;
        runs.push({ start: i, len: j - i });
        i = j;
    }

    var spans = [];
    var out = "";
    var readPos = 0;
    var r = 0;
    while (r < runs.length - 1) { // the last run has nothing left to close it
        var open = runs[r];
        var close = runs[r + 1];
        var inner = s.substring(open.start + open.len, close.start);
        var valid = open.len <= 3 && close.len >= open.len
                 && /^\S/.test(inner) && /\S$/.test(inner);
        if (!valid) { r++; continue; }

        out += s.substring(readPos, open.start);
        spans.push({
            start: out.length,
            end: out.length + inner.length,
            type: open.len === 3 ? "BoldItalic" : (open.len === 2 ? "Bold" : "Italic")
        });
        out += inner;
        readPos = close.start + open.len; // leftover asterisks of a longer closer stay literal
        r += 2;
    }
    out += s.substring(readPos);
    return { text: out, spans: spans };
}

// ---------------------------------------------------------------------------
// Bouncy SFX - port of BouncySFX.jsx v2.1 (see the BOUNCY_* settings up top)
// ---------------------------------------------------------------------------

// Lifts every other letter of a 3+ run off the baseline and adds tracking to the
// ones left down. Reads each character's existing style and rewrites nothing but
// baselineShift and tracking, so kerning, OpenType features, caps, colour and
// size all ride along untouched. Returns true when the layer was changed.
function applyBouncySFX(layerId) {
    var S = stringIDToTypeID;
    // the doc sits at 72 DPI while typesetting (see main), so scale the lift the
    // same way font sizes are scaled: 0.5pt on a 300 DPI page is ~2px, not 0.5px
    var shift = BOUNCY_SHIFT_PT * (g_originalDPI / 72);
    var track = BOUNCY_TRACKING;

    var tk = getTextKeyDesc(layerId);
    var text = tk.getString(S('textKey'));
    var ranges = tk.getList(S('textStyleRange'));
    if (!text.length || !ranges.count) return false;

    var runs = bouncyFindRuns(text);
    if (!runs.any) return false; // nothing to bounce: don't touch the layer at all

    var k, r;
    // which style range each character draws its styling from
    var srcOf = [];
    for (k = 0; k < text.length; k++) srcOf[k] = 0;
    for (r = 0; r < ranges.count; r++) {
        var rd = ranges.getObjectValue(r);
        var from = rd.getInteger(S('from'));
        var to = rd.getInteger(S('to'));
        for (k = Math.max(from, 0); k < to && k < text.length; k++) srcOf[k] = r;
    }

    // current baseline/tracking per character, read once per range
    var cur = [], cache = {};
    for (k = 0; k < text.length; k++) {
        r = srcOf[k];
        if (cache[r] === undefined) {
            var st = ranges.getObjectValue(r).getObjectValue(S('textStyle'));
            cache[r] = { baseline: numOf(st, 'baselineShift', 0), tracking: numOf(st, 'tracking', 0) };
        }
        cur[k] = cache[r];
    }

    // odd positions in a run ride up; even ones stay down and take the tracking
    function delta(idx) {
        var p = runs.pos[idx];
        if (p === undefined) return { baseline: 0, tracking: 0 };
        return (p % 2 === 1) ? { baseline: shift, tracking: 0 } : { baseline: 0, tracking: track };
    }

    // The layer's own baseline/tracking, read off the characters the bounce
    // leaves where they are, so running this over an already-bounced layer lands
    // on the same result instead of stacking a second helping of tracking.
    var bl = [], tr = [];
    for (k = 0; k < text.length; k++) {
        var d = delta(k);
        if (d.baseline === 0) bl.push(cur[k].baseline);
        if (d.tracking === 0) tr.push(cur[k].tracking);
    }
    var base = { baseline: modeOf(bl, 0), tracking: modeOf(tr, 0) };

    var plan = [];
    for (k = 0; k < text.length; k++) {
        var dk = delta(k);
        if (runs.pos[k] !== undefined) {
            plan[k] = { baseline: base.baseline + dk.baseline, tracking: base.tracking + dk.tracking };
        } else {
            // outside a run: leave it, unless it still carries a bounce from an earlier pass
            plan[k] = {
                baseline: near(cur[k].baseline, base.baseline + shift) ? base.baseline : cur[k].baseline,
                tracking: near(cur[k].tracking, base.tracking + track) ? base.tracking : cur[k].tracking
            };
        }
    }

    var aaBefore = tk.hasKey(S('antiAlias')) ? tk.getEnumerationValue(S('antiAlias')) : null;
    bouncyWriteRanges(layerId, ranges, srcOf, plan, text.length);
    bouncyRestoreAntiAlias(layerId, aaBefore);
    return true;
}

// Runs of BOUNCY_TRIGGER_COUNT+ identical characters (case-insensitive)
// -> { any: bool, pos: { index in the string : position within its run } }
function bouncyFindRuns(text) {
    var pos = {}, any = false, run = [], i, j;
    for (i = 0; i <= text.length; i++) {
        var repeats = i > 0 && i < text.length &&
                      bouncyCounts(text.charAt(i)) &&
                      text.charAt(i).toLowerCase() === text.charAt(i - 1).toLowerCase();
        if (repeats) { run.push(i); continue; }

        if (run.length >= BOUNCY_TRIGGER_COUNT) {
            for (j = 0; j < run.length; j++) { pos[run[j]] = j; any = true; }
        }
        run = (i < text.length && bouncyCounts(text.charAt(i))) ? [i] : [];
    }
    return { any: any, pos: pos };
}

// A "letter" is any character with a distinct upper and lower case, which covers
// A-Z plus accented Latin letters without hardcoding a character list.
function bouncyCounts(ch) {
    return BOUNCY_LETTERS_ONLY ? (ch.toLowerCase() !== ch.toUpperCase()) : /\S/.test(ch);
}

// Rebuilds the style ranges, merging neighbours that share a source style and
// land on the same numbers so the layer keeps as few ranges as it started with.
function bouncyWriteRanges(layerId, ranges, srcOf, plan, len) {
    var S = stringIDToTypeID;
    var list = new ActionList();
    var start = 0;

    for (var k = 1; k <= len; k++) {
        var same = k < len && srcOf[k] === srcOf[start] &&
                   near(plan[k].baseline, plan[start].baseline) &&
                   near(plan[k].tracking, plan[start].tracking);
        if (same) continue;

        // getObjectValue hands back a private copy, so this edits the character's
        // real style and every key we don't touch rides along untouched
        var style = ranges.getObjectValue(srcOf[start]).getObjectValue(S('textStyle'));
        // always in points: a shift handed back in pixels is invisible on an HD page
        style.putUnitDouble(S('baselineShift'), S('pointsUnit'), plan[start].baseline);
        putNum(style, 'tracking', plan[start].tracking);
        // Photoshop reports these next to the real values and honours them when the
        // two disagree, so a cloned style would keep re-asserting the old shift
        eraseKey(style, 'impliedBaselineShift');
        eraseKey(style, 'impliedTracking');

        var rangeDesc = new ActionDescriptor();
        rangeDesc.putInteger(S('from'), start);
        rangeDesc.putInteger(S('to'), k);
        rangeDesc.putObject(S('textStyle'), S('textStyle'), style);
        list.putObject(S('textStyleRange'), rangeDesc);
        start = k;
    }

    var to = new ActionDescriptor();
    to.putList(S('textStyleRange'), list);
    var d = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putIdentifier(charIDToTypeID('TxLr'), layerId);
    d.putReference(S('null'), ref);
    d.putObject(S('to'), S('textLayer'), to);
    executeAction(S('set'), d, DialogModes.NO);
}

// Writing the ranges can flip the layer's anti-aliasing; put it back if it moved.
function bouncyRestoreAntiAlias(layerId, before) {
    if (before === null) return;
    var S = stringIDToTypeID;
    var tk = getTextKeyDesc(layerId);
    var after = tk.hasKey(S('antiAlias')) ? tk.getEnumerationValue(S('antiAlias')) : null;
    if (after === null || after === before) return;

    var d = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putProperty(S('property'), S('antiAlias'));
    ref.putIdentifier(charIDToTypeID('TxLr'), layerId);
    d.putReference(S('null'), ref);
    d.putEnumerated(S('to'), S('antiAliasType'), before);
    executeAction(S('set'), d, DialogModes.NO);
}

// the full textKey descriptor (string + style ranges + layer-level text settings) of a text layer
function getTextKeyDesc(layerId) {
    var ref = new ActionReference();
    ref.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("textKey"));
    ref.putIdentifier(charIDToTypeID("TxLr"), layerId);
    return executeActionGet(ref).getObjectValue(stringIDToTypeID("textKey"));
}

function near(a, b) {
    return Math.abs(a - b) < 0.001;
}

// most common value in the list (values within 0.001 count as the same)
function modeOf(values, dflt) {
    if (!values.length) return dflt;
    var buckets = [], i, j;
    for (i = 0; i < values.length; i++) {
        var hit = null;
        for (j = 0; j < buckets.length; j++) {
            if (near(buckets[j].v, values[i])) { hit = buckets[j]; break; }
        }
        if (hit) hit.n++;
        else buckets.push({ v: values[i], n: 1 });
    }
    var best = buckets[0];
    for (j = 1; j < buckets.length; j++) if (buckets[j].n > best.n) best = buckets[j];
    return best.v;
}

function numOf(desc, key, dflt) {
    var id = stringIDToTypeID(key);
    if (!desc.hasKey(id)) return dflt;
    var t = desc.getType(id);
    if (t === DescValueType.UNITDOUBLE) return desc.getUnitDoubleValue(id);
    if (t === DescValueType.INTEGERTYPE) return desc.getInteger(id);
    if (t === DescValueType.DOUBLETYPE) return desc.getDouble(id);
    return dflt;
}

// Writes back using the type Photoshop stored the key as, so tracking stays an
// integer where Photoshop had it as one.
function putNum(desc, key, value) {
    var id = stringIDToTypeID(key);
    if (desc.hasKey(id)) {
        var t = desc.getType(id);
        if (t === DescValueType.UNITDOUBLE) {
            desc.putUnitDouble(id, desc.getUnitDoubleType(id), value);
            return;
        }
        if (t === DescValueType.INTEGERTYPE) {
            desc.putInteger(id, Math.round(value));
            return;
        }
    }
    desc.putDouble(id, value);
}

function eraseKey(desc, key) {
    var id = stringIDToTypeID(key);
    if (!desc.hasKey(id)) return;
    try { desc.erase(id); } catch (e) {}
}

// Adds an outer-stroke layer effect in the inverse of the text color (black text
// gets a white stroke and vice versa), sized relative to the canvas height.
// rgb is the text colour as [r, g, b], 0-255.
function applyInvertedStrokeAction(rgb, canvasHeight) {
    try {
        var r = Math.round(rgb[0]);
        var g = Math.round(rgb[1]);
        var b = Math.round(rgb[2]);

        // per-channel inversion: 255 - value (abs just guards against junk input)
        var strokeR = Math.abs(r - 255); 
        var strokeG = Math.abs(g - 255); 
        var strokeB = Math.abs(b - 255);

        var strokeSize = canvasHeight * (strokepercentage * 0.01);
        var finalEffects = new ActionDescriptor();
        finalEffects.putUnitDouble(charIDToTypeID("Scl "), charIDToTypeID("#Prc"), 100.0);

        var effectDescriptor = new ActionDescriptor();
        var effectColor = new ActionDescriptor();
        
        effectDescriptor.putBoolean(charIDToTypeID("enab"), true);
        effectDescriptor.putEnumerated(charIDToTypeID("Styl"), charIDToTypeID("FStl"), charIDToTypeID("OutF"));
        effectDescriptor.putEnumerated(charIDToTypeID("PntT"), charIDToTypeID("FrFl"), charIDToTypeID("SClr"));
        effectDescriptor.putEnumerated(charIDToTypeID("Md  "), charIDToTypeID("BlnM"), charIDToTypeID("Nrml"));
        effectDescriptor.putUnitDouble(charIDToTypeID("Opct"), charIDToTypeID("#Prc"), 100.0);
        effectDescriptor.putUnitDouble(charIDToTypeID("Sz  "), charIDToTypeID("#Pxl"), strokeSize);

        effectColor.putDouble(charIDToTypeID("Rd  "), strokeR);
        effectColor.putDouble(charIDToTypeID("Grn "), strokeG);
        effectColor.putDouble(charIDToTypeID("Bl  "), strokeB);
        
        effectDescriptor.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), effectColor);
        finalEffects.putObject(charIDToTypeID("FrFX"), charIDToTypeID("FrFX"), effectDescriptor);

        var refr01 = new ActionReference();
        var layerProperties = new ActionDescriptor();
        refr01.putProperty(charIDToTypeID("Prpr"), charIDToTypeID("Lefx"));
        refr01.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        layerProperties.putReference(charIDToTypeID("null"), refr01);
        layerProperties.putObject(charIDToTypeID("T   "), charIDToTypeID("Lefx"), finalEffects);

        executeAction(charIDToTypeID("setd"), layerProperties, DialogModes.NO);
    } catch(e) { rethrowIfCancel(e); } // ActionManager call failed (PS version quirk) - skip this tweak, don't kill the run
}

// Matches the open document to its page block in the txt. The page number comes
// from the filename ("p003" first, trailing digits as fallback), then the blocks
// get scanned in two passes: keyword markers first, bare numbers second.
function getCurrentPageNumberIndex(pages) {
    var fname = activeDocument.name;
    var cleanName = fname.replace(/\[.*?\]/g, "").replace(/\.[^\.]+$/, '');
    
    var matches = cleanName.match(/p(\d+)/i); 
    if (!matches) { matches = cleanName.match(/\d+(?:-\d+)?(?=\D*$)/); }

    var currentPageNumber = matches ? matches[0].match(/\d+/)[0].replace(/^0+/, '') : "-1";
    // anchored at the start of the line: dialogue near the top of a block that
    // mentions a page ("...on page 12 of volume 15") must not claim page 12
    var pageRegex = /^\s*(?:Page|Hoja|P[a\u00e1]gina)\s*(\d+)/i;

    // Pass 1: strict keyword markers ("Page 3:", "Hoja 3:", "Página 3:") at the
    // start of one of the block's first 3 lines. Always wins if present anywhere.
    for (var i = 0; i < pages.length; i++){
        var blockLines = pages[i].split(/\r?\n/);
        for(var j = 0; j < blockLines.length && j < 3; j++) {
            var pageMatch = blockLines[j].replace(/\[.*?\]/g, "").match(pageRegex);
            if (pageMatch) {
                var txtPageNum = pageMatch[1].replace(/^0+/, '');
                if (currentPageNumber === txtPageNum) return i;
            }
        }
    }

    // Pass 2 (OG fallback): bare number markers like "03:" or "3".
// Only checks the first line of each block, and only runs if pass 1 found nothing,
    // so a number inside dialogue can never hijack a page when real markers exist.
    for (var i = 0; i < pages.length; i++){
        // [notes] stripped first, so a header like "[The JOJOLands 36 ...]" isn't read as page 36
        var firstLine = pages[i].split(/\r?\n/)[0].replace(/\[.*?\]/g, "");
        var bareMatch = firstLine.match(/\d+(?=\D*$)/);
        if (bareMatch && currentPageNumber === bareMatch[0].replace(/^0+/, '')) {
            return i;
        }
    }

    return -1;    
}    

// Decides whether a line starts with a real "Speaker:" tag and splits it.
// Returns {speaker, text} for a plausible tag, or null when the whole line is
// dialogue for the inherited speaker. Guards against false positives:
//  - a colon squeezed between two digits is a timestamp/ratio ("12:00", "3:1"),
//    never a tag separator
//  - real tags are short (SPEAKER_MAX_CHARS) and never contain sentence
//    punctuation like ?, ! or quote marks
// Periods and commas stay allowed on purpose: "Mr. Kira:" and joint tags like
// "Josuke, Okuyasu:" are legitimate.
function splitSpeakerTag(line) {
    var idx = line.indexOf(":");
    if (idx === -1) return null;
    if (idx > 0 && /\d/.test(line.charAt(idx - 1)) && /\d/.test(line.charAt(idx + 1))) return null;
    var name = line.substring(0, idx).replace(/^\s+|\s+$/g, '');
    if (name.length === 0 || name.length > SPEAKER_MAX_CHARS) return null;
    if (/["\u201c\u201d\u00ab\u00bb?!]/.test(name)) return null;
    return { speaker: name, text: line.substring(idx + 1).replace(/^\s+|\s+$/g, '') };
}

// Turns the raw lines of one page block into {speaker, line} objects. A "Speaker:"
// prefix sets the current speaker; lines without one inherit the previous speaker.
// Tags on the keep list stay embedded in the text instead of being split off.
function constructLineObjectsForPage(pageLinesRaw, initialSpeaker) {
    var results = [];
    var speaker = initialSpeaker || ''; 

    // turn the keep-tags string back into a trimmed array
    var keptTagsArray = [];
    var splitTags = g_keepTagsString.split(",");
    for (var k = 0; k < splitTags.length; k++) {
        var trimmed = splitTags[k].replace(/^\s+|\s+$/g, '');
        if (trimmed !== "") keptTagsArray.push(trimmed);
    }

    for (var i = 0; i < pageLinesRaw.length; i++){  
        var line = pageLinesRaw[i].toString();
        var cleanLine = line.replace(/\[.*?\]/g, "").replace(/^\s+|\s+$/g,'');
        if (cleanLine === "") continue;
        if (pageMarkerLineRegex.test(cleanLine)) continue; // don't let "Page 1:" / "03:" become the speaker

        var textPart = cleanLine;

        var tag = splitSpeakerTag(cleanLine);
        if (tag) {
            speaker = tag.speaker;
            textPart = tag.text;

            for (var t = 0; t < keptTagsArray.length; t++) {
                if (speaker.toUpperCase() === keptTagsArray[t].toUpperCase()) {
                    textPart = speaker + ": " + textPart;
                    break;
                }
            }
        }
        
        if(textPart.length > 0) results.push({speaker: speaker, line: textPart});  
    }
    return results;
}