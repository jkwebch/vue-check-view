'use strict'

function getPlugin () {
  var ClassNames = {
      Full: 'view-in--full',
      In: 'view-in',
      GtHalf: 'view-in--gt-half',
      GtThird: 'view-in--gt-third',
      Up: 'view-up',
      Down: 'view-down',
      Out: 'view-out',
      Above: 'view-out--above',
      Below: 'view-out--below',
      Threshold: 'view-in--threshold'
    },
    EventTypes = {
      Enter: 'enter',
      Exit: 'exit',
      Progress: 'progress'
    }

  function throttle (handler, timeout) {
    timeout = typeof timeout !== 'undefined' ? timeout : 0
    if (!handler || typeof handler !== 'function') throw new Error('Throttle handler argument is not incorrect. Must be a function.')
    var timeoutTime = 0
    return function (e) {
      if (timeoutTime) return
      timeoutTime = setTimeout(function () {
        timeoutTime = 0
        handler(e)
      }, timeout)
    }
  }

  function roundPercent (v) {
    return (v * 1000 | 0) / 1000
  }

  function objectAssign (obj, src) {
    for (var key in src) {
      if (src.hasOwnProperty(key)) obj[key] = src[key]
    }
    return obj
  }

  function createInstance (Vue, options) {
    options = objectAssign({throttleInterval: 16}, options) // 60fps
    var items = {},
      scrollThrottledHandler = throttle(scrollHandler, options.throttleInterval)
    var scrollValue = window.pageYOffset,
      type = 0,
      itemIndex = 0

    window.addEventListener('scroll', scrollThrottledHandler, { passive: true })
    if (ResizeObserver) new ResizeObserver(scrollThrottledHandler).observe(document.body)
    else window.addEventListener('resize', scrollThrottledHandler)

    function scrollHandler (e) {
      var viewportTop = window.pageYOffset,
        viewportBottom = window.pageYOffset + window.document.documentElement.clientHeight,
        viewportHeight = window.document.documentElement.clientHeight,
        documentHeight = window.document.documentElement.scrollHeight,
        scrollPercent = roundPercent(window.pageYOffset / (documentHeight - viewportHeight))

      scrollValue = viewportTop - scrollValue

      function getInType (i) {
        var rect = i.element.getBoundingClientRect(),
          elementTop = rect.top + viewportTop,
          elementBottom = elementTop + rect.height,
          topIn = elementTop > viewportTop && elementTop < viewportBottom,
          bottomIn = elementBottom > viewportTop && elementBottom < viewportBottom,
          isWithin = elementTop < viewportTop && elementBottom > viewportBottom,
          visible = topIn || bottomIn || isWithin
            ? ((bottomIn ? elementBottom : viewportBottom) - (topIn ? elementTop : viewportTop))
            : 0,
          percentInView = visible / rect.height,
          percentVisible = visible / viewportHeight,
          centerPercent = (elementTop - viewportTop + rect.height / 2) / viewportHeight,
          zeroPoint = viewportTop - rect.height,
          topPercent = (elementTop - zeroPoint) / (viewportBottom - zeroPoint),
          isAbove = percentInView === 0 && elementTop < viewportTop,
          isBelow = percentInView === 0 && elementTop > viewportTop

        return [
          (topIn ? 1 : 0) | (bottomIn ? 2 : 0) | (isAbove ? 4 : 0) | (isBelow ? 8 : 0) | (isWithin ? 16 : 0),
          roundPercent(percentInView), 
          roundPercent(percentVisible), 
          roundPercent(centerPercent), 
          roundPercent(topPercent), 
          rect]
      }

      for (var id in items) {
        var i = items[id],
          inType = getInType(i)
        
        var direction = 
          scrollValue <= 0
            ? scrollValue === 0 ? 0 : 1
            : 2

        var insideThreshold = 0

        if(typeof options.insideThreshold === 'function') {
          insideThreshold = options.insideThreshold() || 0
        } else {
          insideThreshold = options.insideThreshold || 0
        }

        var type = inType[0],
          percentInView = inType[1],
          percentVisible = inType[2],
          percentCenter = inType[3],
          percentTop = inType[4],
          rect = inType[5],
          classes = i.classes,
          classList = i.element.classList,
          inViewChange = i.percent <= insideThreshold && percentInView > insideThreshold,
          outViewChange = i.percent > insideThreshold && percentInView <= insideThreshold,
          inThreshold = percentInView > insideThreshold || percentVisible > insideThreshold

        if (percentInView === 0 && i.percent === 0) continue
        i.rect = rect

        var eventType = (inViewChange && EventTypes.Enter) || (outViewChange && EventTypes.Exit) || EventTypes.Progress

        Object.keys(classes).forEach(function (v) {
          classes[v] = false
        })

        if(i.direction === undefined || inViewChange || outViewChange) {
          i.direction = direction
        }

        if (percentInView >= 0.5) {
          classes[ClassNames.GtHalf] = true
        }
        else if (percentInView >= 0.3) {
          classes[ClassNames.GtThird] = true
        }

        if (type === 16) {
          classes[ClassNames.In] = true
        }
        if (type === 8) {
          classes[ClassNames.Below] = true
          classes[ClassNames.Out] = true
        }
        else if (type === 4) {
          classes[ClassNames.Above] = true
          classes[ClassNames.Out] = true
        }
        else if (type === 3) {
          classes[ClassNames.Full] = true
          classes[ClassNames.In] = true
        }
        else if (type === 1) {
          classes[ClassNames.In] = true
        }
        else if (type === 2) {
          classes[ClassNames.In] = true
        }

        if(inThreshold) {
          classes[ClassNames.Threshold] = true
        }

        classes[ClassNames.Up] = i.direction === 1
        classes[ClassNames.Down] = i.direction === 2

        Object.keys(classes).forEach(function (n) {
          classList.toggle(n, classes[n])
          if (!classes[n]) delete classes[n]
        })

        if (typeof i.handler === 'function') {
          i.handler({
            type: eventType,
            percentInView: percentInView,
            percentTop: percentTop,
            percentCenter: percentCenter,
            scrollPercent: scrollPercent,
            scrollValue: scrollValue,
            target: i
          })
        }

        if (typeof i.onceenter === 'function' && eventType === EventTypes.Enter) {
          i.onceenter({
            type: eventType,
            percentInView: percentInView,
            percentTop: percentTop,
            percentCenter: percentCenter,
            scrollPercent: scrollPercent,
            scrollValue: scrollValue,
            target: i
          })
          delete i.onceenter
          if (!i.persist) delete items[id]
        }

        i.percent = percentInView
        i.type = type
      }

      scrollValue = viewportTop
    }

    Vue.directive('view', {
      unbind: function (element, bind) {
        delete items[element.$scrollId]
      },
      inserted: function (element, bind) {
        var id = element.$scrollId || ('scrollId-' + itemIndex++),
          item = items[id] || {element: element, classes: {}, percent: -1, rect: {}}

        if (bind.modifiers && bind.modifiers.once) {
          item.onceenter = bind.value || function () {
          }
        }
        else {
          item.persist = true
          item.handler = bind.value
        }

        element.$scrollId = id
        items[id] = item
        scrollThrottledHandler()
      }
    })
  }

  return {
    install: function (Vue, options) {
      Vue.directive('view', Vue.prototype.$isServer ? {} : createInstance(Vue, options))
    }
  }
}

if (typeof exports === 'object' && typeof module !== 'undefined') {
  module.exports = getPlugin()
}
else {
  if (typeof window !== 'undefined' && window.Vue) {
    window.Vue.use(getPlugin(), {option: 'custom option of client'})
  }
}
