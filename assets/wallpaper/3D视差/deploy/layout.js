document.addEventListener("DOMContentLoaded", async function () {
  let x_pos = 0;
  let y_pos = 0;
  const fit = 0;

  const canvas = document.getElementById("preview-canvas");
  // 初始化WebGL
  const gl = canvas.getContext("webgl");
  if (!gl) {
    alert("您的浏览器不支持WebGL，无法使用此应用。");
    return;
  }

  // 初始化变量
  let program = null;
  let image_image = [];
  let image_depth = [];
  let texture_image = [];
  let texture_depth = [];
  let buffers = null;

  // 顶点着色器源码
  const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec2 aTextureCoord;

    varying vec2 vTextureCoord;

    void main() {
        gl_Position = aVertexPosition;
        vTextureCoord = aTextureCoord;
    }
`;

  // 片段着色器源码
  const fsSource = (() => {
    let fsDef = "";
    let fsMain = "";
    for (let i = 0; i < layers.length; i++) {
      fsDef += `
        uniform sampler2D uSamplerLayer${i};
        uniform sampler2D uSamplerDepth${i};
        uniform vec2 uDepthRange${i};
        `;
      fsMain += `
        s = texture2D(uSamplerDepth${i}, vTextureCoord);
        offset = clamp(s.r, uDepthRange${i}.x, uDepthRange${i}.y) - 0.5;
        color_layer = texture2D(uSamplerLayer${i}, vTextureCoord + uOffset * vec2(offset, offset));
        color = mix(color, color_layer, color_layer.a);
        `;
    }
    return `
    precision mediump float;

    varying vec2 vTextureCoord;

    ${fsDef}
    uniform vec2 uOffset;

    void main() {
      vec4 s;
      vec4 color = vec4(0.0, 0.0, 0.0, 0.0);
      vec4 color_layer = vec4(0.0, 0.0, 0.0, 0.0);
      float offset = 0.0;

      ${fsMain}

      color.a = 1.0;
      gl_FragColor = color;
    }
`;
  })();
  console.log(fsSource);

  // 初始化WebGL程序
  function initShaderProgram() {
    const vertexShader = loadShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fsSource);

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      alert("无法初始化着色器程序: " + gl.getProgramInfoLog(shaderProgram));
      return null;
    }

    return shaderProgram;
  }

  // 加载着色器
  function loadShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      alert("编译着色器时出错: " + gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  // 初始化缓冲区
  function initBuffers() {
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    const positions = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const textureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);

    const textureCoordinates = [0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);

    return {
      position: positionBuffer,
      textureCoord: textureCoordBuffer,
    };
  }

  // 计算保持长宽比的顶点坐标
  function calculateAspectPreservingVertices(imageWidth, imageHeight, canvasWidth, canvasHeight) {
    console.log(imageWidth, imageHeight, canvasWidth, canvasHeight);
    const imageAspect = imageWidth / imageHeight;
    const canvasAspect = canvasWidth / canvasHeight;

    let vertexCoord;
    let positions;

    const scaledWidth = canvasAspect / imageAspect;
    const scaledHeight = imageAspect / canvasAspect;
    if (imageAspect > canvasAspect) {
      // 图像比画布宽，以画布高度为准
      vertexCoord = fit
        ? [
            0.5 - scaledWidth / 2,
            1.0,
            0.5 + scaledWidth / 2,
            1.0,
            0.5 - scaledWidth / 2,
            0.0,
            0.5 + scaledWidth / 2,
            0.0,
          ]
        : [0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0];
      positions = fit
        ? [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0]
        : [-1.0, -scaledWidth, 1.0, -scaledWidth, -1.0, scaledWidth, 1.0, scaledWidth];
    } else {
      vertexCoord = fit
        ? [
            0.0,
            0.5 + scaledHeight / 2,
            1.0,
            0.5 + scaledHeight / 2,
            0.0,
            0.5 - scaledHeight / 2,
            1.0,
            0.5 - scaledHeight / 2,
          ]
        : [0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0];
      positions = fit
        ? [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0]
        : [-scaledHeight, -1.0, scaledHeight, -1.0, -scaledHeight, 1.0, scaledHeight, 1.0];
    }
    return {
      vertexCoord: new Float32Array(vertexCoord),
      positions: new Float32Array(positions),
    };
  }

  // 加载纹理
  function loadTexture(image) {
    console.log(image, image.complete);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // 先用单个像素填充纹理
    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([0, 0, 255, 255]); // 不透明的蓝色
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType, pixel);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, image);

    // WebGL1对不同尺寸的图片支持有限
    if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    return texture;
  }

  function isPowerOf2(value) {
    return (value & (value - 1)) === 0;
  }

  // 渲染场景
  function render() {
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const canvas = gl.canvas;
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.useProgram(program);

    // 设置顶点缓冲区
    const positionLocation = gl.getAttribLocation(program, "aVertexPosition");
    gl.enableVertexAttribArray(positionLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // 设置纹理坐标缓冲区
    const textureCoordLocation = gl.getAttribLocation(program, "aTextureCoord");
    gl.enableVertexAttribArray(textureCoordLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
    gl.vertexAttribPointer(textureCoordLocation, 2, gl.FLOAT, false, 0, 0);

    // 设置纹理单元
    layers.forEach((image_layer, index) => {
      gl.activeTexture(gl["TEXTURE" + index * 2]);
      gl.bindTexture(gl.TEXTURE_2D, texture_depth[index]);
      gl.uniform1i(gl.getUniformLocation(program, "uSamplerDepth" + index), index * 2);
      gl.activeTexture(gl["TEXTURE" + (index * 2 + 1)]);
      gl.bindTexture(gl.TEXTURE_2D, texture_image[index]);
      gl.uniform1i(gl.getUniformLocation(program, "uSamplerLayer" + index), index * 2 + 1);
      gl.uniform2f(gl.getUniformLocation(program, "uDepthRange" + index), image_layer.range[0], image_layer.range[1]);
    });

    // 设置uniform变量
    const posLocation = gl.getUniformLocation(program, "uOffset");
    gl.uniform2f(posLocation, x_pos * x_shift, y_pos * y_shift);
    // 绘制场景
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function texture_loaded() {
    console.log(texture_image, texture_depth);
    return (
      texture_image.length == layers.length &&
      texture_image.every((v) => v) &&
      texture_depth.length == layers.length &&
      texture_depth.every((v) => v)
    );
  }

  // 初始化WebGL
  function initWebGL() {
    program = initShaderProgram();
    buffers = initBuffers();

    // 加载默认图片
    layers.forEach((image_layer, index) => {
      const image_i = new Image();
      image_i.onload = function (ev) {
        texture_image[index] = loadTexture(ev.target);
        console.log("texture layer", index);
        if (texture_loaded()) {
          render();
        }
      };
      image_i.src = image_layer.image;
      image_image[index] = image_i;
      const image_d = new Image();
      image_d.onload = function (ev) {
        texture_depth[index] = loadTexture(ev.target);
        console.log("texture depth", index);
        if (texture_loaded()) {
          render();
        }
      };
      image_d.src = image_layer.depth;
      image_depth[index] = image_d;
    });

    // 调整canvas大小
    resizeCanvas();
  }

  // 调整canvas大小
  function resizeCanvas() {
    const container = document.querySelector("#preview-canvas");
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    if (program && image_image?.[0]?.width && image_image?.[0]?.height) {
      // 更新顶点坐标以保持图片长宽比
      const vertexCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexCoordBuffer);

      const { vertexCoord, positions } = calculateAspectPreservingVertices(
        image_image[0].width,
        image_image[0].height,
        canvas.width,
        canvas.height
      );
      console.log(vertexCoord);
      gl.bufferData(gl.ARRAY_BUFFER, vertexCoord, gl.STATIC_DRAW);

      const positionsBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionsBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

      // 更新缓冲区引用
      buffers.textureCoord = vertexCoordBuffer;
      buffers.position = positionsBuffer;

      render();
    }
  }

  // 初始化
  initWebGL();

  // 窗口大小变化时调整canvas
  window.addEventListener("resize", resizeCanvas);
  canvas.addEventListener("mousemove", (ev) => {
    x_pos = (ev.offsetX / canvas.width) * 2 - 1;
    y_pos = (ev.offsetY / canvas.height) * 2 - 1;
    render();
  });
});
