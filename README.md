—-—-----------------------------------------------| READ ME |—-—-----------------------------------------------

The Living Wizard — WebGL 2.0 Dynamic 3D Character

An animated, interactive 3D wizard was built entirely from procedural geometry (cone frustums and UV spheres) in raw WebGL 2.0 / GLSL 300 es, and no external 3D libraries. It idles with a gentle bob/sway/spin, blink on a randomized schedule, tracks the camera with its eyes, and casts a glowing burst of ember when clicked.

Controls
  Drag — orbiting the camera around the wizard
  Scroll — zooming in and out
  Click — to cast a spell

The Three Pillars
  Injecting Color
  Colors are baked per-vertex on the CPU as 0-255 bytes, packed into a Uint8Array, and uploaded as colorBuffer. The attribute is read with:
  
  
  The true normalized flag rescales those bytes to 0.0-1.0 before the vertex shader sees them — a quarter the memory of storung floats directly. The shader forwards this as [out vec3 fragmentColor]; between the vertex and fragments stages, the rasterizer barycentrically interpolates that value across every pixel of a triangle, which is wy the sphere heads and cone hats shade smoothly instead of looking flat-shaded per triangle.
  
The Spatial Journey
  Vertices start in Model Space (local coordinates like the head sphere's center). Each frame, uModel — built fresh from the current idle bob/sway/spin — promotes them to World Space. uViewProjection (view matrix × perspective matrix) then carries them to Clip Space: 
  
  The Z-axis drives draw order: the perspective matrix writes -1 into row 3 so a vertex's clip-space W ends up tied to its view-space depth, which is what makes distant geometry shrink correctly during the perspective divide. gl.enable(gl.DEPTH_TEST) then uses that resolved Z per-pixel so nearer triangles (like the beard) correctly occlude farther ones (like the robe collar), regardless of draw order. 
  
Efficiency and State
    A VAO is a saved "blueprint" of which buffer feeds which attribute, with what type/stride/offset — set up once instead of repeated before every draw. Stride is the byte gap between one vertex's data and the next in a buffer; offset is where a given attribute starts within that gap. Here, every attribute lives in its own dedicated buffer rather than being interleaved together, so both are 0 for all eight attributes — the pattern only needs nonzero values when multiple attributes are packed into a single shared buffer. This project uses three VAOs: wizardVAO, particleVAO, eyeVAO, one per shader program. Without VAOs, forgetting to reconfigure an attribute before a draw call can silently leak one object's buffer state into another's — the "Global State Trap." VAOs fix this by isolating each object's setup, and the render loop unbinds (gl.bindVertexArray(null)) after every draw call as a "clean slate" habit so no state is left implicitly active for the next draw to inherit. 
    
Reflection & AI Prompt Log

Reflection
    Write a short paragraph on the challenges of debugging the graphics pipeline. Contrast the "silent failures" of the GPU (where a single wrong bit results in a blank screen) with standard JavaScript debugging.
    Debugging this was rough in a way normal JS debugging isn't. Usually when I break something, the console yells at me with a red error and a line number, and I can follow the breadcrumbs back to my mistake. WebGL just doesn't do that — most of the time it's a blank canvas with zero explanation, and wrong stride, a forgotten normalize flag, and a bad matrix order can all cause that same blank screen. That's actually why the "make your errors loud" tip clicked for me — setting an obnoxious clear color instead of black at least let me tell "nothing is drawing" apart from "something is drawing wrong." After that, it was just guess-and-check: shader logs, link status, attribute locations, buffer contents, and finally the matrix math, since the GPU was never going just to tell me what I broke. 

AI Prompt Log

Prompt Provided
Specific Technical Adjustment Made to Output

Example: "make a wizard" 
    Wrote buildWizardGeometry() composing the figure from two reusable primitives — addFrustumSide() (cone frustum, used for robe/beard/hat/staff) and addSphere() (UV sphere, used for head/orb) — with outward normals derived via cross product of the slant and circumferential tangent vectors. 
    
Example: "interact with my wizard" 
    Added orbit camera via pointerdown/pointermove/pointerup (yaw/pitch from drag delta) and wheel (distance clamp), replacing the fixed eye array with spherical-coordinate camera position computed per frame. 
    
Example: "eyes that move / track the camera " 
    Added eye-white spheres tagged with socket centers; pupils rendered as a separate point-sprite shader, world position computed via mat4TransformPoint() projected onto the model matrix's own right/up axis columns. 

