class WebGLRenderer {
    meshes = [];
    shadowMeshes = [];
    lights = [];

    constructor(gl, camera) {
        this.gl = gl;
        this.camera = camera;
    }

    addLight(light) {
        this.lights.push({
            entity: light,
            meshRender: new MeshRender(this.gl, light.mesh, light.mat)
        });
    }
    addMeshRender(mesh) { this.meshes.push(mesh); }
    addShadowMeshRender(mesh) { this.shadowMeshes.push(mesh); }

    render(time, deltaime) {
        const gl = this.gl;

        gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
        gl.clearDepth(1.0); // Clear everything
        gl.enable(gl.DEPTH_TEST); // Enable depth testing
        gl.depthFunc(gl.LEQUAL); // Near things obscure far things

        console.assert(this.lights.length != 0, "No light");
        //console.assert(this.lights.length == 1, "Multiple lights"); //取消多光源检测

        for (let i = 0; i < this.meshes.length; i++) {
            if (this.meshes[i].mesh.count > 10) {
                this.meshes[i].mesh.transform.rotate[1] = this.meshes[i].mesh.transform.rotate[1] + degrees2Radians(5) * deltaime;
            }
        }


        for (let l = 0; l < this.lights.length; l++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.lights[l].entity.fbo); // 绑定到当前光源的framebuffer
            gl.clearColor(1.0, 1.0, 1.0, 1.0); // shadowmap默认白色（无遮挡），解决地面边缘产生阴影的问题（因为地面外采样不到，默认值为0会认为是被遮挡）
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // 清除shadowmap上一帧的颜色、深度缓存，否则会一直叠加每一帧的结果


            // Draw light
            let lightPos = this.lights[l].entity.lightPos;
            let speed = Math.min(Math.random() + 0.5, 1) * this.lights[l].entity.lightSpeed;
            lightPos = vec3.rotateY(lightPos, lightPos, this.lights[l].entity.focalPoint, degrees2Radians(Math.abs(speed)) * deltaime);
            lightPos = vec3.rotateZ(lightPos, lightPos, this.lights[l].entity.focalPoint, degrees2Radians(speed) * deltaime);
            lightPos = vec3.rotateX(lightPos, lightPos, this.lights[l].entity.focalPoint, degrees2Radians(speed) * deltaime);
            if (lightPos[1] < 60) {
                lightPos[1] = 60
                this.lights[l].entity.lightSpeed = -this.lights[l].entity.lightSpeed;
            }
            this.lights[l].entity.lightPos = lightPos; //给DirectionalLight的lightPos赋值新的位置，CalcLightMVP计算LightMVP需要用到
            this.lights[l].meshRender.mesh.transform.translate = lightPos;

            this.lights[l].meshRender.draw(this.camera);


            // Shadow pass
            if (this.lights[l].entity.hasShadowMap == true) {
                for (let i = 0; i < this.shadowMeshes.length; i++) {
                    if (this.shadowMeshes[i].material.lightIndex != l)
                        continue;// 是当前光源的材质才绘制，否则跳过
                    // Edit Start 每帧更新shader中uniforms的LightMVP
                    this.gl.useProgram(this.shadowMeshes[i].shader.program.glShaderProgram);
                    let translation = this.shadowMeshes[i].mesh.transform.translate;
                    let rotation = this.shadowMeshes[i].mesh.transform.rotate;
                    let scale = this.shadowMeshes[i].mesh.transform.scale;
                    let lightMVP = this.lights[l].entity.CalcLightMVP(translation, rotation, scale);
                    this.shadowMeshes[i].material.uniforms.uLightMVP = { type: 'matrix4fv', value: lightMVP };
                    // Edit End
                    this.shadowMeshes[i].draw(this.camera);
                }
            }

            // Edit Start 非第一个光源Pass时进行一些设置（Base Pass和Additional Pass区分）
            if (l != 0) {
                // 开启混合，把Additional Pass混合到Base Pass结果上，否则会覆盖Base Pass的渲染结果
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                // gl.blendFunc(gl.ONE, gl.ONE);
            }
            // Edit End

            // Camera pass
            for (let i = 0; i < this.meshes.length; i++) {
                if (this.meshes[i].material.lightIndex != l)
                    continue;// 是当前光源的材质才绘制，否则跳过
                this.gl.useProgram(this.meshes[i].shader.program.glShaderProgram);

                // Assume that `program` is your shader program and `gl` is your WebGL context
                let alphaLocation = gl.getUniformLocation(this.meshes[i].shader.program.glShaderProgram, 'uAlpha');
                // Set the alpha value
                let alphaValue = 1 / this.lights.length; // Change this value dynamically as needed
                gl.uniform1f(alphaLocation, alphaValue);
                // Edit Start 每帧更新shader中uniforms参数
                let translation = this.meshes[i].mesh.transform.translate;
                let rotation = this.meshes[i].mesh.transform.rotate;
                let scale = this.meshes[i].mesh.transform.scale;
                let lightMVP = this.lights[l].entity.CalcLightMVP(translation, rotation, scale);
                this.meshes[i].material.uniforms.uLightMVP = { type: 'matrix4fv', value: lightMVP };
                this.meshes[i].material.uniforms.uLightPos = { type: '3fv', value: this.lights[l].entity.lightPos }; // 光源方向计算、光源强度衰减
                // Edit End
                this.meshes[i].draw(this.camera);
            }
            // Edit Start 还原Additional Pass的设置
            gl.disable(gl.BLEND);
            // Edit End
        }
    }
}