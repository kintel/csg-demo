# Challenge

Write an image-space CSG algorithm using WebGL.

## Goal and specs

* Render any CSG model where operands are mesh primitives and operators are Union, Difference and Intersection.
* The CSG model should be shadable with normal materials
* The CSG model should be rendered into a Z buffer to make it possible to combine with geometry from other renderers.
* It should be possible to render objects with transparency
* Maximize browser compatibility by using WebGL 1.0 and as few extensions as possible, and choose extensions which are widely available.
* Keep mobile in mind

# WebGL limitations

WebGL 1.0 has several limitations which influence our choices:

* We cannot write to gl_FragDepth. EXT_frag_depth is not available on Safari
* We cannot draw to multiple buffers WEBGL_draw_buffers is not available on Safari
* Depth textures is an extension (WEBGL_depth_texture). Wide desktop adoption, unknown mobile adoption
* Float textures is an extension (OES_texture_float). Wide desktop adoptions, unknown mobile adoption

# Algorithms

Multiple image-space CSG algorithms exist, but none of them has been
publicly implemented using WebGL. Most algorithms are conceived using
CPU-based or OpenGL fixed pipeline-based rendering.

## Normalization

Most algorithm require CSG models to be _normalized_ into a _sum of
products_ form. A product is defined as a series of intersections
followed by a series of subtractions. Since subtracting an object is
equivalent to intersecting with the complement of the object, this can
be converted to a series of intersections (i.e. a product of intersections).

## Goldfeather

FIXME

## SCS

SCS (Sequenced Convex Subtractions) is based on operating _only_ on
convex primitives. Non-convex primitives must be decomposed into
convex pieces. Operating on convex primitives enables a simpler
algorithm using fewer rendering passes than Goldfeather.

**Outline:**

**For each product:**

1. Render convex intersections
2. Render convex subtractions
3. Clip transparent areas
4. Render product with correct material
5. Merge product into accumulation buffer

Finally, transfer accumulation buffer into framebuffer

### Render convex intersections

This is the easier part of SCS and is done in three render passes:

1. Render the furthest front faces into the Z buffer with all other buffers disabled
2. Count number of hidden backfaces (increase stencil on depth fail)
3. Reset Z buffer where stencil != N (N is number of intersecting objects). Render a quad with maximum depth.

The result is a Z buffer which is correct for the intersection part of the product.

Optimizations:

* FIXME: What can be done with 2. and 3. for single objects?

### Render convex differences

This is slightly more complex since differences may reveal underlying
differences. To correctly resolve this, each difference may need to be
rendered more than once. A naive approach is to create a subtraction
sequence in a double loop, yielding N^2 subtractions.

Assuming a correct (or naive) subtraction sequence, for each objects in the sequence:
1. Using the Z buffer from the intersection rendering, mark _front fragments_ passing Z test (mark stencil with all other buffers disabled)
2. Render all _back faces_ with an inverted Z test masked against the stencil.

Optimizations:

* To avoid clearing the stencil buffer for each pass, we can increase the stencil mask value instead => only clear the stencil buffer once every 256 passes (for a typical 8 bit stencil buffer).
* Calculating an optimal subtraction sequence is not trivial and can be done view-dependent or view-independent. The subtraction sequence is strongly correlated to the depth complexity of the objects being subtracted.
* A common view-dependent technique is to batch objects that don't overlap in screen-space into the same stencil pass. This can also significantly improve subtraction sequence calculation.

The result is a Z buffer which is correct for both the intersection
and difference parts of the product, except see-through areas (see
next section).

### Clip transparent areas

Since the Z buffer only contains the front-most depth values, we need
to detect subtractions which penetrate though the object so we can see
through it.
This is quite trivial:

1. Mark visible _back fragments_ of intersections (mark using stencil buffer)
2. Reset Z buffer where stencil is set. Render a quad with maximum depth.

The result is a Z buffer which correctly represents the entire product.

### Render using correct material

This pass uses the correct material shader and the current Z-buffer
information to provide a correct color buffer for the CSG product:

o Render Front faces of intersections and back faces of subtractions with depth test of EQUAL

_Note about materials:_

To have the freedom to use existing shaders to render materials,
we strive towards not having to modify these as that could be somewhat
of a headache depending on what rendering libraries we use. This means
that we need to be able to use the fixed function Z test for this
rendering pass.

If we were to relax this requirement, we could optimize the process somewhat:

If we use the alpha channel as a synthetic z buffer, we don't need to
use a depth buffer for the products. The means that we could use a
normal renderbuffer without a depth texture, or request a framebuffer
object without a depth buffer if that's supported.

This would also allow us to support systems without the
WEBGL_depth_texture extension, but we would still require float
textures.

### Merge products into accumulation buffer

Since each product needs full access to depth and stencil buffers, we
need to accumulate product rendering results somewhere before
processing the next product.

This is somewhat of a challenge: We have two incoming color and two
incoming z buffers which we want to merge into a single color- and
z buffer. In WebGL (without the EXT_frag_depth extension), the
_only_ way to write into a Z buffer is to render into it (meaning that
the z values must come from the vertex shader).

There are multiple ways around this:

1. Use the alpha component of the accumulation buffer to store Z values

    Use a fragment shader to replace the depth test by comparing incoming
depth values (from the depth texture used for product rendering), and
store resulting Z values in the alpha component of the accumulation
buffer.

    Note: For this to have acceptable Z resolution, we need to use float
textures for the accumulation buffer (needs OES_texture_float)

    The main drawback of this method is that we cannot render into a
    proper Z buffer in the framebuffer, which means that all
    subsequent (non-CSG) geometry must also be rendered using the
    alpha-for-z technique causing extra rendering passes for such
    geometry.

2. Render correct Z values using a separate depth-only rendering pass in the end

    By rendering actual objects (without correct material) into the
    target framebuffer, we can achieve a correct Z buffer. For this to
    work, we need to simulate depthFunc(EQUAL) in a fragment
    shader. This is a bit tricky since incoming Z values (fragCoord.z)
    in a fragment shader are clamped to the current Z buffer resolution
    (typically 24-bit) while any accumulated Z buffer value we can get
    hold of would typically be a float component (32-bit). Equality
    check of different resolution floating point numbers will likely
    be far to fragile to use in practice.

    FIXME: Can we somehow calculate an accumulated product with a correct 24-bit z buffer?

    To get around this, we can calculate our own 32-bit Z values all
    the way and compare these in the end:

    * Use float textures also for the product rendering buffer
    * In the SCS passes, calculate the current Z value and store in the alpha channel. This gives us a second Z buffer in the alpha channel at the end of a product rendering)
    * When rendering the real material, we need to ignore and preserve the alpha channel
    * At the end of a CSG object, render all components of all products once. Use a shader that calculates our own Z values and only pass fragments where this value is equal to our accumulation buffer's alpha value. Use the color channels from the accumulation buffer.

    -> The result is a correct color- and depth buffer for the whole CSG model, at the expense of one extra object rendering pass.

    Note: For this to have acceptable Z resolution, we need to use
float textures for the accumulation buffer (needs OES_texture_float)

    NB! We still need a depth texture to be able ot render the objects
    with correct material without writing custom shaders for all
    materials to manage an EQUAL depth test.

## SCS optimization opportunities

### Merging

Why do we need to successively merge products into a final texture?

-> This is done to avoid another rendering pass to be able to compare
   depth values. It's basically a manual z buffering job.

Since our variant of SCS needs this separate rendering pass anyway, we
could skip the merge part of the original SCS algorithm and let the
framebuffer's Z buffer do this. If we know that we'll ever only
render CSG content into a framebuffer, such a merge step would be
faster though.

Modified SCS:

1. Render product as usual into a float texture with real color values
   and alpha as synthetic depth
2. Merge the product into the framebuffer by performing a rendering
   pass where only the depth buffer is taken from the product's
   components and the color buffer from the previously generated float
   texture

### Special case: Only intersections

In this case, we can skip the convex subtraction and z buffer clipping
pass.

### Special case: Single positive object

If the intersection part of the product contains only a single object,
we just render the object as is into the render target. No need for z
buffer clipping or stencil operations.

### Special case: Single positive object, no differences

Single object, just render straight to the framebuffer
