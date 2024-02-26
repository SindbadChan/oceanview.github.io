/*
 Generic  Canvas Layer for leaflet 0.7 and 1.0-rc,
 copyright Stanislav Sumbera,  2016 , sumbera.com , license MIT
 originally created and motivated by L.CanvasOverlay  available here: https://gist.github.com/Sumbera/11114288

 */

// -- L.DomUtil.setTransform from leaflet 1.0.0 to work on 0.0.7
//------------------------------------------------------------------------------
if(!L.DomUtil.setTransform){

  L.DomUtil.setTransform = function (el, offset, scale) {
    var pos = offset || new L.Point(0, 0);

    el.style[L.DomUtil.TRANSFORM] =
      (L.Browser.ie3d ?
      'translate(' + pos.x + 'px,' + pos.y + 'px)' :
      'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)') +
      (scale ? ' scale(' + scale + ')' : '');
  };
}

// -- support for both  0.0.7 and 1.0.0 rc2 leaflet
L.WindCanvasLayer = (L.Layer ? L.Layer : L.Class).extend({
  // -- initialized is called on prototype
  initialize: function (options) {
    this._map    = null;
    this._canvas = null;
    this._frame  = null;
    this._delegate = null;
    L.setOptions(this, options);
  },

  delegate :function(del){
    this._delegate = del;
    return this;
  },

  needRedraw: function () {
    if (!this._frame) {
      this._frame = L.Util.requestAnimFrame(this.drawLayer, this);
    }
    return this;
  },

  //-------------------------------------------------------------
  _onLayerDidResize: function (resizeEvent) {
    this._canvas.width = resizeEvent.newSize.x;
    this._canvas.height = resizeEvent.newSize.y;
  },
  //-------------------------------------------------------------
  _onLayerDidMove: function () {
    var topLeft = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);
    this.drawLayer();
  },
  //-------------------------------------------------------------
  getEvents: function () {
    var events = {
      resize: this._onLayerDidResize,
      moveend: this._onLayerDidMove
    };
    if (this._map.options.zoomAnimation && L.Browser.any3d) {
      events.zoomanim =  this._animateZoom;
    }

    return events;
  },
  //-------------------------------------------------------------
  onAdd: function (map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'leaflet-layer');
    this.tiles = {};

    var size = this._map.getSize();
    this._canvas.width = size.x;
    this._canvas.height = size.y;

    var animated = this._map.options.zoomAnimation && L.Browser.any3d;
    L.DomUtil.addClass(this._canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));


    map._panes.overlayPane.appendChild(this._canvas);
    map.on(this.getEvents(),this);

    var del = this._delegate || this;
    del.onLayerDidMount && del.onLayerDidMount(); // -- callback
    this.needRedraw();

    var self = this;
    setTimeout(function(){
      self._onLayerDidMove();
    }, 0);
  },

  //-------------------------------------------------------------
  onRemove: function (map) {
    var del = this._delegate || this;
    del.onLayerWillUnmount && del.onLayerWillUnmount(); // -- callback


    map.getPanes().overlayPane.removeChild(this._canvas);

    map.off(this.getEvents(),this);

    this._canvas = null;

  },

  //------------------------------------------------------------
  addTo: function (map) {
    map.addLayer(this);
    return this;
  },
  // --------------------------------------------------------------------------------
  LatLonToMercator: function (latlon) {
    return {
      x: latlon.lng * 6378137 * Math.PI / 180,
      y: Math.log(Math.tan((90 + latlon.lat) * Math.PI / 360)) * 6378137
    };
  },

  //------------------------------------------------------------------------------
  drawLayer: function () {
    // -- todo make the viewInfo properties  flat objects.
    var size   = this._map.getSize();
    var bounds = this._map.getBounds();
    var zoom   = this._map.getZoom();

    var center = this.LatLonToMercator(this._map.getCenter());
    var corner = this.LatLonToMercator(this._map.containerPointToLatLng(this._map.getSize()));

    var del = this._delegate || this;
    del.onDrawLayer && del.onDrawLayer( {
      layer : this,
      canvas: this._canvas,
      bounds: bounds,
      size: size,
      zoom: zoom,
      center : center,
      corner : corner
    });
    this._frame = null;
  },
  // -- L.DomUtil.setTransform from leaflet 1.0.0 to work on 0.0.7
  //------------------------------------------------------------------------------
  _setTransform: function (el, offset, scale) {
    var pos = offset || new L.Point(0, 0);

    el.style[L.DomUtil.TRANSFORM] =
      (L.Browser.ie3d ?
      'translate(' + pos.x + 'px,' + pos.y + 'px)' :
      'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)') +
      (scale ? ' scale(' + scale + ')' : '');
  },

  //------------------------------------------------------------------------------
  _animateZoom: function (e) {
    var scale = this._map.getZoomScale(e.zoom);
    // -- different calc of offset in leaflet 1.0.0 and 0.0.7 thanks for 1.0.0-rc2 calc @jduggan1
    var offset = L.Layer ? this._map._latLngToNewLayerPoint(this._map.getBounds().getNorthWest(), e.zoom, e.center) :
      this._map._getCenterOffset(e.center)._multiplyBy(-scale).subtract(this._map._getMapPanePos());

    L.DomUtil.setTransform(this._canvas, offset, scale);


  }
});

L.windCanvasLayer = function () {
  return new L.WindCanvasLayer();
};


/**
 * 气象图层 - 风
 */
class Wind {
  /**
   * 构造函数
   * @param  {L.LatLng} latlng 经纬度
   * @param  {Number} speed  风速（海里/小时）
   * @param  {Number} dir    风向（度，正北方向为0度，顺时针）
   * @param  {Object} options    绘制选项
   * @return {Null}        [description]
   */
  constructor(latlng, speed, dir, options = {}) {
    this._latlng = latlng;
    this._speed = this._convertToMileS(speed);
    this._dir = dir;
    this.options = Object.assign({
      isDrawLeftRight: false, // 是否绘制相邻两边
      windLineLen: 16, // 风向线长度
      levelLineMinLen: 4, // 风力线长度
      chunkCount: 6 //等分点个数，至少六等分
    }, options);
  }

  get latLng() {
    return this._latlng;
  }

  set latLng(value) {
    this._latlng = value;
  }

  get speed() {
    return this._speed;
  }

  set speed(value) {
    this._speed = this._convertToMileS(value);
  }

  get dir() {
    return this._dir;
  }

  set dir(value) {
    this._dir = value;
  }

  get level() {
    //  return 10;
    var level = 0;
    var speed = this._speed;
    if(speed <= 0.2) {
      level = 0;
    } else if(speed > 0.2 && speed <= 1.5) {
      level = 1;
    } else if(speed > 1.5 && speed <= 3.3) {
      level = 2;
    } else if(speed > 3.3 && speed <= 5.4) {
      level = 3;
    } else if(speed > 5.4 && speed <= 7.9) {
      level = 4;
    } else if(speed > 7.9 && speed <= 10.7) {
      level = 5;
    } else if(speed > 10.7 && speed <= 13.8) {
      level = 6;
    } else if(speed > 13.8 && speed <= 17.1) {
      level = 7;
    } else if(speed > 17.1 && speed <= 20.7) {
      level = 8;
    } else if(speed > 20.7 && speed <= 24.4) {
      level = 9;
    } else if(speed > 24.4 && speed <= 28.4) {
      level = 10;
    } else if(speed > 28.4 && speed <= 32.6) {
      level = 11;
    } else if(speed > 32.6 && speed <= 36.9) {
      level = 12;
    } else if(speed > 36.9 && speed <= 41.4) {
      level = 13;
    } else if(speed > 41.4 && speed <= 46.1) {
      level = 14;
    } else if(speed > 46.1 && speed <= 50.9) {
      level = 15;
    } else if(speed > 50.9 && speed <= 56.0) {
      level = 16;
    } else if(speed > 56.0) {
      level = 17;
    }
    return level;
  }

  get color() {
    var speed = this._speed;
    if(speed <= 7.9) {
      // 0-4级风
      return '#D3DE44';
    } else if(speed > 7.9 && speed <= 17.1) {
      // 5-7级风
      return '#E68514';
    } else if(speed > 17.1 && speed <= 36.9) {
      // 8-12级风
      return '#E82318';
    } else {
      // 13-17级风
      return '#B80D75';
    }
  }

  _convertToMileS(speed) {
    return Number(speed) * 1852 / 3600;
  }
}

L.WindLayer = L.WindCanvasLayer.extend({

  initialize: function (options, config) {
    L.WindCanvasLayer.prototype.initialize.call(this, options);
    this.cfg = Object.assign({
      lat: '0',
      lng: '1',
      value: '2',
      dir: '3',
      data: [],
      isDrawLeftRight: false
    }, config);
    this._data = this.cfg.data;
    this._sortData = this.sortByLat(this._data);
  },

  setData: function (data) {
    // -- custom data set
    this._data = data;
    this._sortData = this.sortByLat(this._data);
    this.needRedraw(); // -- call to drawLayer
  },

  onLayerDidMount: function () {
    // -- prepare custom drawing
  },

  onLayerWillUnmount: function () {
    // -- custom cleanup
  },

  onDrawLayer: function (info) {
    // -- custom  draw
    var canvas = this._canvas = info.canvas;
    var ctx = this._ctx = info.canvas.getContext('2d');
    var map = this._map = info.layer._map;
    var zoom = map.getZoom();
    var sortData = this._sortData;
    var latOffset = 1;
    var lngOffset = 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 根据不同级别确定抽稀粒度
    if(zoom < 2) {
      latOffset = 16;
      lngOffset = 16;
    } else if(zoom >= 2 && zoom < 3) {
      latOffset = 8;
      lngOffset = 8;
    } else if(zoom >= 3 && zoom < 5) {
      latOffset = 4;
      lngOffset = 4;
    } else {
      latOffset = 1;
      lngOffset = 1;
    }

    // 按纬度绘制
    var latPts, latlng, lLatLng, rLatLng, speed, dir, windobj, lwindobj, rwindobj;
    for(let i = 0, len = sortData.length; i < len; i += latOffset) {
      latPts = sortData[i];
      for(let j = 0, lenj = latPts.length; j < lenj; j += lngOffset) {
        latlng = L.latLng(latPts[j][this.cfg.lat], latPts[j][this.cfg.lng]);
        speed = Number(latPts[j][this.cfg.value]);
        dir = Number(latPts[j][this.cfg.dir]);
        windobj = new Wind(latlng, speed, dir, { isDrawLeftRight: this.cfg.isDrawLeftRight });
        this.drawWind(ctx, windobj);
        if(windobj.options.isDrawLeftRight) {
          lLatLng = latlng.getSubtract360LatLng();
          rLatLng = latlng.getAdd360LatLng();
          lwindobj = new Wind(lLatLng, speed, dir, { isDrawLeftRight: this.cfg.isDrawLeftRight });
          rwindobj = new Wind(rLatLng, speed, dir, { isDrawLeftRight: this.cfg.isDrawLeftRight });
          this.drawWind(ctx, lwindobj);
          this.drawWind(ctx, rwindobj);
        }
      }
    }
  },

  sortByLat: function (data) {
    // console.time('按纬度分隔');
    var newData = [];
    var temp = [];
    // 将数据按纬度划分
    for(let i = 0, len = data.length; i < len; i++) {
      if(temp.length === 0) {
        temp.push(data[i]);
      } else {
        if(data[i][0] === temp[temp.length - 1][0]) {
          temp.push(data[i]);
        } else {
          newData.push(temp);
          temp = [];
        }
      }
    }
    // console.timeEnd('按纬度分隔');
    return newData;
  },

  drawWind: function (ctx, WindObj) {
    // console.time('drawWind');
    var startPoint = this._map.latLngToContainerPoint(WindObj.latLng);
    var len = WindObj.options.windLineLen;
    var r = WindObj.options.levelLineMinLen;
    var arc = Math.PI / 180 * WindObj.dir;
    var a = startPoint.x;
    var b = startPoint.y;
    var x0 = a;
    var y0 = b - len;
    var endPoint = {
      x: a + (x0 - a) * Math.cos(arc) - (y0 - b) * Math.sin(arc),
      y: b + (x0 - a) * Math.sin(arc) + (y0 - b) * Math.cos(arc)
    };
    var level = WindObj.level;
    var floorLevel = Math.floor(level / 8);
    var color = WindObj.color;

    var count8 = floorLevel; // 8级个数
    var count2 = Math.floor(level % 8 / 2); // 2级个数
    var count1 = level % 2 === 0 ? 0 : 1; // 1级个数
    var count = WindObj.options.chunkCount; // 等分点个数

    ctx.save();
    ctx.beginPath();
    if(count8 === 0 && count2 === 0 && count1 === 0) {
      ctx.arc(startPoint.x, startPoint.y, r, 0, Math.PI * 2);
    } else {
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.lineTo(endPoint.x, endPoint.y);
      // 8 级
      for(let i = 0; i < count8; i++) {
        let sp = this.getChunkPoint(startPoint, endPoint, count, 2 * i + 1);
        let sp2 = this.getChunkPoint(startPoint, endPoint, count, 2 * i + 1 + 2);
        let lp = this.getPointByDistance(startPoint, sp, r * 2);
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(lp.x, lp.y);
        ctx.lineTo(sp2.x, sp2.y);
      }
      // 2级
      for(let i = 0; i < count2; i++) {
        let sp = this.getChunkPoint(startPoint, endPoint, count, 2 * count8 + 1 + i);
        let lp = this.getPointByDistance(startPoint, sp, r * 2);
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(lp.x, lp.y);
      }
      // 1级
      for(let i = 0; i < count1; i++) {
        let sp = this.getChunkPoint(startPoint, endPoint, count, 2 * count8 + 1 + count2 + i);
        let lp = this.getPointByDistance(startPoint, sp, r);
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(lp.x, lp.y);
      }
    }
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
    // console.timeEnd('drawWind');
  },

  //取一条线的 count 等分点的第number(1,2,3...)个点，从endPoint开始计数。
  getChunkPoint: function (startPoint, endPoint, count, number) {
    var points = [];
    var xn, yn;
    points.push(startPoint);
    for(let i = 1; i < count; i++) {
      xn = startPoint.x + i * (endPoint.x - startPoint.x) / count;
      yn = startPoint.y + i * (endPoint.y - startPoint.y) / count;
      points.push(L.point(xn, yn));
    }
    points.push(endPoint);
    points = points.reverse();
    return points[number - 1];
  },

  getPointByDistance: function (sp, ep, r) {
    var x, y;
    var k = (ep.y - sp.y) / (ep.x - sp.x);
    var r2 = Math.pow(r, 2);
    var k2 = Math.pow(k, 2);
    //不同坐标系符号问题
    if(ep.x > sp.x) {
      if(ep.y < sp.y) {
        x = ep.x + Math.sqrt((r2 * k2) / (1 + k2));
        y = ep.y + Math.sqrt(r2 / (1 + k2));
      } else {
        x = ep.x - Math.sqrt((r2 * k2) / (1 + k2));
        y = ep.y + Math.sqrt(r2 / (1 + k2));
      }

    } else if(ep.x < sp.x) {
      if(ep.y > sp.y) {
        x = ep.x - Math.sqrt((r2 * k2) / (1 + k2));
        y = ep.y - Math.sqrt(r2 / (1 + k2));
      } else {
        x = ep.x + Math.sqrt((r2 * k2) / (1 + k2));
        y = ep.y - Math.sqrt(r2 / (1 + k2));
      }
    } else {
      if(ep.y > sp.y) {
        x = ep.x - r;
        y = ep.y;
      } else {
        x = ep.x + r;
        y = ep.y;
      }
    }
    return L.point(x, y);
  }

});


L.windLayer = function (options) {
  return new L.WindLayer(options);
};