/**
 * @description 用于控制多个dom click事件的互斥，点击本身则切换激活/失效状态
 * @constructor
 * * @example <caption> 使用示例 </caption>
 * 1.DOM示例
 * <ul class="map_toolbar_list">
 *      <li mutex-tool-name="search-box">查询</li>
 *      <li mutex-tool-name="center" class="active">监控中心</li>
 *      <li>滑块</li>
 * </ul>
 *
 * 2.对$(".map_toolbar_list li")注册互斥click事件，标记同一个组的对象互斥。
 * 将带有mutex-tool-name属性的li注册为互斥对象，class="active"标记对象初始为激活状态
 * var groupName = "maptools";
 * var manager = new MutexClickManager();
 * manager.registerGroup(groupName, $(".map_toolbar_list li"));
 * //调用click方法
 * manager.bind({
 *  groupName: groupName,
 *  toolName: "search-box",
 *  active: function(items){},
 *  deactive: function(items){}
 * });
 */
MutexClickManager = function () {
    this.groups = {};
    this._eventCache = {};
    this._$element = null;
}

/**
 * @description 将互斥对象注册组
 * @param groupname {String} 分组名称
 * @param jq {String} jqdom对象 例如$(".selected")
 */
MutexClickManager.prototype.registerGroup = function(groupname, jq){
    var self = this;
    var group = self.groups[groupname];
    if(group == null){
        group = self.groups[groupname] = [];
    }

    for(var i = 0; i < jq.length; i++){
        var $element = $(jq[i]);
        var toolname = $element.attr("mutex-tool-name");
        if(toolname){
            group.push({
                id: toolname,
                jqElement: $element,
                active: null, //使激活事件
                deactive: null //使取消激活事件
            });
            $element.groupName = groupname;
        }
    }
}

/**
 * @description 互斥对象绑定click方法
 * @param options
 * @param options.groupName {String} 所属分组名
 * @param options.toolName {String} DOM节点对应的mutex-tool-name属性值
 * @param options.active {function(items){}} 对应的激活方法
 * @param options.deactive {function(items){}} 对应的失效方法
 */
MutexClickManager.prototype.bind = function(options){
    var opts = options || {};
    var groupName = opts.groupName,
        toolName = opts.toolName,
        activeFunc = opts.active,
        deactiveFunc = opts.deactive,
        force = opts.force == null ? false : opts.force; //是否强制绑定事件，false时，state状态只会绑定一次

    var self = this;
    var $element = self.getElement(opts);

    if($element == null) return;

    var evtCache = self._eventCache;
    //判断指定状态的是否已绑定事件,KEY:groupName_toolName
    var key = [groupName, toolName].join("_");

    var flag = force || evtCache[key];

    //强制绑定 或 未绑定
    if(force || !evtCache[key]){
        $element.on("click", function(){
            self._$element = $element;
            var dcstate = $element.hasClass("active"); //是否是激活状态
            //var multi = $element.attr("dc-tool-multi"); //"true"|"false",是否为多选类似checkbox，默认为单选类似radio

            //执行其他element 对应的 deactive
            var group = self.groups[$element.groupName];

            //获取当前点击的item
            var currentItem = self.getCurrentActiveItem();
            var outParams = {
                activeItem: null, //当前正在激活项
                deactiveItem: null //当前正在失效项
            };

            if(dcstate){
                outParams.deactiveItem = currentItem;
            }else{
                outParams.activeItem = currentItem;
            }

            for(var i = 0; i < group.length; i++){
                var item = group[i];
                if($element == item.jqElement) continue;

                var active = item.jqElement.hasClass("active"); //是否是激活状态
                if(active && item.deactive){
                    outParams.deactiveItem = item;
                    item.jqElement.removeClass("active");
                    item.deactive(outParams);
                }
            }

            //对改element执行activeFunc 或者 deactiveFunc
            if(dcstate){
                $element.removeClass("active");
                if(deactiveFunc){
                    deactiveFunc(outParams);
                }

            }else{
                $element.addClass("active");
                if(activeFunc){
                    activeFunc(outParams);
                }
            }
        });
        evtCache[key] = true;
    }
}

/**
 * 获取当前正在激活的项
 */
MutexClickManager.prototype.getCurrentActiveItem = function(){
    var self = this;
    var $element = self._$element;
    var group = self.groups[$element.groupName];

    var output = null;
    for(var i = 0; i < group.length; i++){
        var item = group[i];
        if($element == item.jqElement){
            output = item;
            break;
        }
    }

    return output;
}
/**
 * 判断是否全部为未激活状态
 * @param groupName
 */
MutexClickManager.prototype.isAllDeactive = function(groupName){
    var flag = true; //默认为全部未激活状态
    var self = this;
    var group = self.groups[groupName];
    if(group == null) return flag;

    for(var i = 0; i < group.length; i++){
        var item = group[i];
        var active = item.jqElement.hasClass("active"); //是否是激活状态
        if(active){
            flag = false;
            break;
        }
    }
    return flag;
}

/**
 * 设置全部失效状态
 */
MutexClickManager.prototype.setAllDeactive = function(groupName){
    var self = this;
    var group = self.groups[groupName];
    if(group == null) return;

    for(var i = 0, $element; i < group.length; i++){
        var item = group[i];
        $element = item.jqElement;
        var active = $element.hasClass("active"); //是否是激活状态
        var active = item.jqElement.hasClass("active"); //是否是激活状态
        if(active && item.deactive){
            $element.removeClass("active");
            item.deactive({
                activeItem: null, //当前正在激活项
                deactiveItem: item //当前正在失效项
            });
        }
    }
}

MutexClickManager.prototype.getElement = function(options){
    var opts = options || {};
    var groupName = opts.groupName,
        toolName = opts.toolName;
        activeFunc = opts.active,
        deactiveFunc = opts.deactive;

    var $element = null;
    var self = this;
    var group = self.groups[groupName];
    if(group == null) return $element;

    for(var i = 0; i < group.length; i++){
        var item = group[i];
        if(toolName === item.id){
            $element = item.jqElement;

            item.active = activeFunc;
            item.deactive = deactiveFunc;
            break;
        }
    }
    return $element;
}

