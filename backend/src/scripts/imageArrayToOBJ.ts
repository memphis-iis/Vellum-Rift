import crypto from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";

export type RGBA = [number, number, number, number]; //create RGBA type, Alpha = transparency
export type Vertex = [number, number, number];//one pixel's color
export type PixelDataTuple = [number, number, RGBA]; //one point in 3D space

//tuple (groups multiple ordered elems into single entity), in this case fixed length and must contain numbers
export type MeshData = {
    vertices: Vertex[]; //array of vertices
    faces: number[]; //connection of vertices to form the triangles
    colors: RGBA[]; //array of RGBA values and one color for each point
};

export type HeightMode = "red" | "green" | "blue" | "alpha" | "brightness"; //create type for height mode, can be one of the 4 color channels, brightness averages red, green, and blue
//in TypeScript "|" is a union type operator, allowing a variable to hold multiple types"
function getHeight(rgba: RGBA, mode: HeightMode): number { //function to get height value based on selected color channel
    const [r, g, b, a] = rgba; //gives each value a name
    if (mode === "red") return r / 255;
    if (mode === "green") return g / 255;
    if (mode === "blue") return b / 255;
    if (mode === "alpha") return a / 255;
    return (r + g + b) / 3 / 255; //shows the light and dark values of the manuscript 

}

export class TopographyMeshGenerator {
    //generate image and convert it to mesh data, leave it up to export function to decide what format it will be exported in 
    generate(imageArray: PixelDataTuple[], mode: HeightMode): MeshData { //takes in imageArray to return MeshData
        const vertices: Vertex[] = []; //empty list to later store vertices
        const faces: number[] = []; //empty list to later store faces
        const colors: RGBA[] = []; //empty list to later store colors

        if (imageArray.length === 0) {
            throw new Error("imageArray must not be empty");
        }
        const width = Math.max(...imageArray.map(([x]) => x)) + 1; //finds the maximum x value in the image array and adds 1 to get the width of the image
        const height = Math.max(...imageArray.map(([_, y]) => y)) + 1; //finds the maximum y value in the image array and adds 1 to get the height of the image


        //arranges pixels top row to bototm row and left to right inside each row 
        const orderedPixels = [...imageArray].sort( //copy prevents changing original input
            ([x1, y1], [x2, y2]) => y1 - y2 || x1 - x2,
        );

        for (const pixel of orderedPixels) { //for each pixel...
            const [x, y, rgba] = pixel; //get its position and colos
            const zHeight = getHeight(rgba, mode); //get its height

            vertices.push([x, y, zHeight]); //create a 3D point
            colors.push(rgba); //save its original color
        }



        //connects vertices into triangles
        //the loops find every square so we can split them into triangles
        for (let y = 0; y < height - 1; y++) { //loops through each row except the last 
            for (let x = 0; x < width - 1; x++) { //loops through each column except the last
                const topLeft = y * width + x; //calculates the index of the top left vertex of the current pixel
                const topRight = topLeft + 1; //calculates the index of the top right vertex of the current pixel
                const bottomLeft = (y + 1) * width + x; //calculates the index of the bottom left vertex of the current pixel
                const bottomRight = bottomLeft + 1; //calculates the index of the bottom right vertex of the current pixel

                faces.push(topLeft, bottomLeft, topRight);
                faces.push(topRight, bottomLeft, bottomRight);
            }

        }
        return {
            vertices,
            faces,
            colors
        };
    }
}



export class GLTFExporter {
    /**
     * Build a glTF Binary (.glb) in-memory and return it as a Buffer.
     * This is the primary path for server-side generation (stored to MinIO).
     *
     * Uses a temp-file round-trip because NodeIO lacks a direct in-memory
     * binary export on this version of @gltf-transform/core.
     */
    async exportToBuffer(mesh: MeshData): Promise<Buffer> {
        if (mesh.colors.length !== mesh.vertices.length) {
            throw new Error("Each vertex must have exactly one color");
        }

        const document = this.buildDocument(mesh);

        const tmpPath = join(tmpdir(), `gltf-${crypto.randomUUID()}.glb`);
        try {
            const io = new NodeIO();
            await io.write(tmpPath, document);

            // NodeIO.write can resolve before the file is fully flushed to disk.
            // Retry a few times with a short back-off to avoid flaky ENOENT reads.
            let lastError: Error | undefined;
            for (let attempt = 0; attempt < 5; attempt++) {
                try {
                    return await readFile(tmpPath);
                } catch (err) {
                    lastError = err as Error;
                    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
                        continue;
                    }
                    throw err;
                }
            }
            throw lastError ?? new Error("Failed to read temp glTF file after retries");
        } finally {
            // Best-effort cleanup — don't let a cleanup failure mask the real error
            await unlink(tmpPath).catch(() => {});
        }
    }

    /**
     * Build a glTF Binary (.glb) and write it to a file path on disk.
     * Kept for manual / offline tooling use.
     */
    async export(mesh: MeshData, outputPath: string): Promise<void> {
        if (mesh.colors.length !== mesh.vertices.length) { //each 3D point must have one matching color
            throw new Error("Each vertex must have exactly one color");
        }
        const document = this.buildDocument(mesh);

        //saves the file
        const io = new NodeIO();
        await io.write(outputPath, document);
    }

    /** Shared document construction — used by both export paths. */
    private buildDocument(mesh: MeshData): Document {
        const document = new Document(); //create a new glTF document
        const buffer = document.createBuffer(); //storage for numerical data

        const positions = new Float32Array(mesh.vertices.flat()); //tightly packed numerical arrays
        const indices = new Uint32Array(mesh.faces); //in a format that glTF can read, which is a 32 bit unsigned integer

        const colors = new Float32Array( //turns colors into glTF compatible format, which is a float between 0 and 1
            mesh.colors.flatMap(([r, g, b, a]) => [
                r / 255,
                g / 255,
                b / 255,
                a / 255,
            ]),
        );

        //an accessor is a label explaining how gLTF should read stored numbers
        //location of 3D points
        const positionAccessor = document
            .createAccessor("position")
            .setType("VEC3")
            .setArray(positions)
            .setBuffer(buffer);


//which points should be connected into triangles
        const indexAccessor = document
            .createAccessor("indices")
            .setType("SCALAR") //read one number at a time
            .setArray(indices)
            .setBuffer(buffer);

            //colors of the points
        const colorAccessor = document
            .createAccessor("colors")
            .setType("VEC4") //groups 4 of float numbers together to represent a color in RGBA format
            .setArray(colors)
            .setBuffer(buffer);


            //how the mesh is displayed
        const material = document
            .createMaterial("topography-material")
            .setAlphaMode("BLEND") //uses alpha transparency 
            .setDoubleSided(true); //shows both the top and underside

            //combines all the pieces
        const primitive = document
            .createPrimitive()
            .setAttribute("POSITION", positionAccessor)
            .setAttribute("COLOR_0", colorAccessor)
            .setIndices(indexAccessor)
            .setMaterial(material);


        //primitive->mesh->node->scene->document->file
        const gltfMesh = document.createMesh("topography-mesh").addPrimitive(primitive);

        const node = document.createNode("topography").setMesh(gltfMesh);



        document.createScene("scene").addChild(node);

        return document;
    }
}