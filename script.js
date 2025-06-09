// Get references to DOM elements
const videoElement = document.getElementById('cameraFeed');
const canvasElement = document.getElementById('imageCanvas');
const captureButton = document.getElementById('captureButton');

// OCR and Local Storage Data
let ocrData = null; // To store OCR results from current capture
let currentImageDataURL = null; // Store the data URL of the current image on canvas
let savedItems = JSON.parse(localStorage.getItem('ocrAppItems')) || [];
const MAX_ITEMS = 10; // Limit the number of stored items
let currentLoadedItemId = null; // ID of the currently loaded item from savedItems
let currentHighlights = []; // Holds highlight objects for the image on canvas

console.log('Loaded saved items on init:', savedItems);

// Highlighting state
let isDrawing = false;
let startX, startY; // currentX, currentY are not needed globally
let selectionRect = null; // { x, y, width, height } for the temporary selection

// Function to start the camera
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = stream;
    } catch (error) {
        console.error('Error accessing the camera:', error);
    }
}

// Draws a single committed highlight object
function drawSingleHighlight(highlight, context) {
    context.fillStyle = 'rgba(255, 255, 0, 0.3)'; // Semi-transparent yellow
    context.fillRect(highlight.x, highlight.y, highlight.width, highlight.height);
    context.strokeStyle = 'yellow';
    context.lineWidth = 1;
    context.strokeRect(highlight.x, highlight.y, highlight.width, highlight.height);

    // Optional: Emphasize words within the highlight
    // context.fillStyle = 'rgba(0,0,0,0.7)';
    // highlight.words.forEach(word => {
    //    const { x0, y0, x1, y1 } = word.bbox;
    //    context.fillRect(x0, y0, x1 - x0, y1 - y0); // Example: fill word bbox
    // });
}

// Redraws the entire canvas: base image, OCR boxes, committed highlights, and current selection rectangle
function redrawCanvasAndHighlights() {
    const context = canvasElement.getContext('2d');
    context.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (currentImageDataURL) {
        const img = new Image();
        img.onload = () => {
            context.drawImage(img, 0, 0, canvasElement.width, canvasElement.height);
            if (ocrData) {
                drawOCRResults(ocrData, context);
            }
            currentHighlights.forEach(h => drawSingleHighlight(h, context));
            if (isDrawing && selectionRect) {
                context.fillStyle = 'rgba(0, 100, 255, 0.3)';
                context.fillRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
                context.strokeStyle = 'blue';
                context.lineWidth = 1;
                context.strokeRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
            }
        };
        img.src = currentImageDataURL;
    } else if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA && !currentImageDataURL) {
        // Live video before capture (no persistent elements, only temp selection)
        context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
        if (isDrawing && selectionRect) {
             context.fillStyle = 'rgba(0, 100, 255, 0.3)';
             context.fillRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
             context.strokeStyle = 'blue';
             context.lineWidth = 1;
             context.strokeRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
        }
    }
}

// Function to draw OCR results (bounding boxes)
function drawOCRResults(data, context) {
    if (!data || !data.words) return;
    context.strokeStyle = 'red';
    context.lineWidth = 2;
    data.words.forEach(word => {
        const { x0, y0, x1, y1 } = word.bbox;
        context.strokeRect(x0, y0, x1 - x0, y1 - y0);
    });
}

// Finalizes a selection, identifies words, and stores it as a highlight
function finalizeHighlight(rect) {
    if (!ocrData || !ocrData.words || !rect || rect.width === 0 || rect.height === 0) {
        return;
    }
    const intersectingWords = ocrData.words.filter(word => {
        const { x0, y0, x1, y1 } = word.bbox;
        // Check for intersection (classic bounding box collision)
        return !(x1 < rect.x || x0 > rect.x + rect.width || y1 < rect.y || y0 > rect.y + rect.height);
    });

    if (intersectingWords.length > 0) {
        const newHighlight = {
            id: Date.now(), // Unique ID for the highlight itself
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            words: intersectingWords.map(w => ({ text: w.text, bbox: w.bbox })) // Store relevant word info
        };
        currentHighlights.push(newHighlight);
        console.log('Highlight added:', newHighlight);
        updateSavedItemHighlights(); // Persist this change
    }
}

// Updates the 'highlights' array for the currently loaded item in 'savedItems' and saves to localStorage
function updateSavedItemHighlights() {
    if (currentLoadedItemId) {
        const itemIndex = savedItems.findIndex(item => item.id === currentLoadedItemId);
        if (itemIndex !== -1) {
            savedItems[itemIndex].highlights = [...currentHighlights]; // Update with a copy
            localStorage.setItem('ocrAppItems', JSON.stringify(savedItems));
            console.log('Saved item highlights updated in localStorage.');
        } else {
            console.warn('Could not find loaded item in savedItems to update highlights.');
        }
    } else {
        console.warn('No item loaded, cannot save highlights to a specific saved entry yet.');
        // This case occurs if highlighting on a fresh capture before it's technically "loaded" by ID.
        // The saveCapture function will handle new items.
    }
}


// Function to save the current capture
function saveCapture() {
    if (!ocrData) {
        console.warn('No OCR data available to save.');
        return;
    }
    // If it's a new capture (not a re-save of an existing loaded item)
    // or if currentLoadedItemId is somehow not set for a new capture.
    if (!currentLoadedItemId || !savedItems.find(item => item.id === currentLoadedItemId)) {
        const newEntryId = Date.now();
        const captureEntry = {
            id: newEntryId,
            imageDataURL: currentImageDataURL,
            ocrData: ocrData,
            highlights: [...currentHighlights] // Save current highlights with new capture
        };
        savedItems.unshift(captureEntry);
        if (savedItems.length > MAX_ITEMS) {
            savedItems = savedItems.slice(0, MAX_ITEMS);
        }
        currentLoadedItemId = newEntryId; // Set this new entry as the "active" one
        console.log('Capture saved!', captureEntry.id, savedItems.length, "items total.");
    }
    // Always update localStorage
    localStorage.setItem('ocrAppItems', JSON.stringify(savedItems));
    console.log('Data saved to localStorage.');
}

// Function to capture a photo, perform OCR, draw results, and save
async function capturePhoto() {
    const context = canvasElement.getContext('2d');
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    currentImageDataURL = canvasElement.toDataURL('image/png');

    ocrData = null;
    currentHighlights = []; // Reset highlights for new capture
    selectionRect = null;
    currentLoadedItemId = null; // This is a new capture, not associated with a previously loaded one by ID yet

    console.log('OCR in progress...');
    document.body.style.cursor = 'progress';

    try {
        const result = await Tesseract.recognize(currentImageDataURL, 'eng', {
            logger: m => { if(m.status === 'recognizing text') console.log(`OCR progress: ${(m.progress * 100).toFixed(2)}%`) }
        });
        ocrData = result.data;
        console.log('Recognized text:', ocrData.text);
        saveCapture(); // This will now also handle currentLoadedItemId for the new save
    } catch (error) {
        console.error('Error during OCR:', error);
    } finally {
        document.body.style.cursor = 'default';
        console.log('OCR process finished.');
        redrawCanvasAndHighlights();
    }
}

// Function to load a capture
function loadCapture(itemId) {
    const item = savedItems.find(i => i.id === itemId);
    if (item) {
        console.log('Loading capture:', item.id);
        currentImageDataURL = item.imageDataURL;
        ocrData = item.ocrData;
        currentHighlights = item.highlights ? [...item.highlights] : []; // Load highlights, ensure array
        currentLoadedItemId = item.id;
        selectionRect = null;
        redrawCanvasAndHighlights();
    } else {
        console.warn('Item not found:', itemId);
    }
}

// Canvas Mouse Event Handlers
function handleMouseDown(e) {
    if (!currentImageDataURL || !ocrData) { // Only allow drawing if image and OCR data are present
        console.log("Please capture an image and wait for OCR before highlighting.");
        return;
    }
    isDrawing = true;
    startX = e.offsetX;
    startY = e.offsetY;
    // selectionRect is defined relative to canvas, not image, so direct offsetX/Y is fine.
    selectionRect = { x: startX, y: startY, width: 0, height: 0 };
    redrawCanvasAndHighlights();
}

function handleMouseMove(e) {
    if (!isDrawing) return;
    const currentX = e.offsetX;
    const currentY = e.offsetY;
    selectionRect.width = currentX - startX;
    selectionRect.height = currentY - startY;
    redrawCanvasAndHighlights();
}

function handleMouseUp(e) {
    if (!isDrawing) return;
    isDrawing = false;

    // Normalize rectangle
    if (selectionRect.width < 0) {
        selectionRect.x += selectionRect.width;
        selectionRect.width *= -1;
    }
    if (selectionRect.height < 0) {
        selectionRect.y += selectionRect.height;
        selectionRect.height *= -1;
    }

    if (selectionRect.width > 0 && selectionRect.height > 0) {
        console.log('Selection rectangle finalized:', selectionRect);
        finalizeHighlight(selectionRect);
    }
    selectionRect = null; // Clear temporary selection rectangle
    redrawCanvasAndHighlights(); // Redraw to show new highlight and remove temp rect
}

function handleMouseLeave(e) {
    if (isDrawing) {
        isDrawing = false;
        selectionRect = null;
        console.log('Selection cancelled due to mouseleave');
        redrawCanvasAndHighlights();
    }
}

canvasElement.addEventListener('mousedown', handleMouseDown);
canvasElement.addEventListener('mousemove', handleMouseMove);
canvasElement.addEventListener('mouseup', handleMouseUp);
canvasElement.addEventListener('mouseleave', handleMouseLeave);

window.addEventListener('load', () => {
    startCamera(); // Initialize camera

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed: ', error);
            });
    }
});

if (captureButton) {
    captureButton.addEventListener('click', capturePhoto);
} else {
    console.error('Capture button not found');
}

// Example: Make loadCapture accessible for testing from console
// window.loadCapture = loadCapture;
