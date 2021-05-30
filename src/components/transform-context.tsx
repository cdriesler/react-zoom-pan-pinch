import React, { Component } from "react";

import {
  LibrarySetup,
  PositionType,
  ReactZoomPanPinchProps,
  ReactZoomPanPinchState,
  VelocityType,
  BoundsType,
  AnimationType,
  ReactZoomPanPinchRef,
} from "../models";

import {
  createSetup,
  createState,
  handleCallback,
  getTransformStyles,
  makePassiveEventOption,
  getContext,
} from "../utils";

import { contextInitialState } from "../constants/state.constants";

import { handleCancelAnimation } from "../core/animations/animations.utils";
import { isWheelAllowed } from "../core/zoom/wheel.utils";
import { isPinchAllowed, isPinchStartAllowed } from "../core/pinch/pinch.utils";
import { handleCalculateBounds } from "../core/bounds/bounds.utils";

import {
  handleWheelStart,
  handleWheelZoom,
  handleWheelStop,
} from "../core/zoom/wheel.logic";

import {
  isPanningAllowed,
  isPanningStartAllowed,
} from "../core/pan/panning.utils";
import {
  handlePanning,
  handlePanningEnd,
  handlePanningStart,
} from "../core/pan/panning.logic";
import {
  handlePinchStart,
  handlePinchStop,
  handlePinchZoom,
} from "../core/pinch/pinch.logic";
import {
  handleDoubleClick,
  isDoubleClickAllowed,
} from "../core/handlers/handlers.utils";

type StartCoordsType = { x: number; y: number } | null;

const Context = React.createContext(contextInitialState);

class TransformContext extends Component<
  ReactZoomPanPinchProps & {
    setRef: (context: ReactZoomPanPinchRef) => void;
  }
> {
  public mounted = true;

  public transformState: ReactZoomPanPinchState = createState(this.props);

  public setup: LibrarySetup = createSetup(this.props);

  // Components
  public wrapperComponent: HTMLDivElement | null = null;
  public contentComponent: HTMLDivElement | null = null;
  // Initialization
  public isInitialized = false;
  public bounds: BoundsType | null = null;
  // wheel helpers
  public previousWheelEvent: WheelEvent | null = null;
  public wheelStopEventTimer: ReturnType<typeof setTimeout> | null = null;
  public wheelAnimationTimer: ReturnType<typeof setTimeout> | null = null;
  // panning helpers
  public isPanning = false;
  public startCoords: StartCoordsType = null;
  // pinch helpers
  public distance: null | number = null;
  public lastDistance: null | number = null;
  public pinchStartDistance: null | number = null;
  public pinchStartScale: null | number = null;
  // velocity helpers
  public velocity: VelocityType | null = null;
  public velocityTime: number | null = null;
  public lastMousePosition: PositionType | null = null;
  // animations helpers
  public animate = false;
  public animation: AnimationType | null = null;
  public maxBounds: BoundsType | null = null;
  // key press
  public pressedKeys: { [key: string]: boolean } = {};

  componentDidMount(): void {
    const passive = makePassiveEventOption();
    // Panning on window to allow panning when mouse is out of component wrapper
    window.addEventListener("mousedown", this.onPanningStart, passive);
    window.addEventListener("mousemove", this.onPanning, passive);
    window.addEventListener("mouseup", this.onPanningStop, passive);
    window.addEventListener("keyup", this.setKeyUnPressed, passive);
    window.addEventListener("keydown", this.setKeyPressed, passive);

    this.handleRef();
  }

  componentWillUnmount(): void {
    const passive = makePassiveEventOption();

    window.removeEventListener("mousedown", this.onPanningStart, passive);
    window.removeEventListener("mousemove", this.onPanning, passive);
    window.removeEventListener("mouseup", this.onPanningStop, passive);
    window.removeEventListener("keyup", this.setKeyUnPressed, passive);
    window.removeEventListener("keydown", this.setKeyPressed, passive);

    handleCancelAnimation(this);
  }

  componentDidUpdate(oldProps: ReactZoomPanPinchProps): void {
    if (oldProps !== this.props) {
      handleCalculateBounds(this, this.transformState.scale);
      this.setup = createSetup(this.props);
    }
  }

  handleInitializeWrapperEvents = (wrapper: HTMLDivElement): void => {
    // Zooming events on wrapper
    const passive = makePassiveEventOption();

    wrapper.addEventListener("wheel", this.onWheelZoom, passive);
    wrapper.addEventListener("dblclick", this.onDoubleClick, passive);
    wrapper.addEventListener("touchstart", this.onTouchPanningStart, passive);
    wrapper.addEventListener("touchmove", this.onTouchPanning, passive);
    wrapper.addEventListener("touchend", this.onTouchPanningStop, passive);
  };

  handleInitializeContentEvents = (content: HTMLDivElement): void => {
    const { centerOnInit, limitToBounds, limitToWrapper } = this.setup;
    const { scale, positionX, positionY } = this.transformState;

    const shouldFitComponent = limitToBounds && !limitToWrapper;
    const shouldCenterComponent = centerOnInit && !positionX && !positionY;

    // Todo check if it works
    if (shouldFitComponent || shouldCenterComponent) {
      const x = 25;
      const y = 25;

      const transform = getTransformStyles(x, y, scale, "%");

      content.style.transform = transform;
    }

    this.applyTransformation();
    this.forceUpdate();
  };

  //////////
  // Zoom
  //////////

  onWheelZoom = (event: WheelEvent): void => {
    const { disabled } = this.setup;
    if (disabled) return;

    const isAllowed = isWheelAllowed(this, event);
    if (!isAllowed) return;

    const keysPressed = this.isPressingKeys(this.setup.wheel.activationKeys);
    if (!keysPressed) return;

    handleWheelStart(this);
    handleWheelZoom(this, event);
    handleWheelStop(this, event);
  };

  //////////
  // Pan
  //////////

  onPanningStart = (event: MouseEvent): void => {
    const { disabled } = this.setup;
    const { onPanningStart } = this.props;
    if (disabled) return;

    const isAllowed = isPanningStartAllowed(this, event);
    if (!isAllowed) return;

    const keysPressed = this.isPressingKeys(this.setup.wheel.activationKeys);
    if (!keysPressed) return;

    event.preventDefault();
    event.stopPropagation();

    handleCancelAnimation(this);
    handlePanningStart(this, event);
    handleCallback(getContext(this), onPanningStart);
  };

  onPanning = (event: MouseEvent): void => {
    const { disabled } = this.setup;
    const { onPanning } = this.props;

    if (disabled) return;

    const isAllowed = isPanningAllowed(this);
    if (!isAllowed) return;

    const keysPressed = this.isPressingKeys(this.setup.wheel.activationKeys);
    if (!keysPressed) return;

    event.preventDefault();
    event.stopPropagation();

    handlePanning(this, event.clientX, event.clientY);
    handleCallback(getContext(this), onPanning);
  };

  onPanningStop = (): void => {
    const { onPanningStop } = this.props;

    if (this.isPanning) {
      handlePanningEnd(this);
      handleCallback(getContext(this), onPanningStop);
    }
  };

  //////////
  // Pinch
  //////////

  onPinchStart = (event: TouchEvent): void => {
    const { disabled } = this.setup;
    const { onPinchingStart, onZoomStart } = this.props;
    if (disabled) return;

    const isAllowed = isPinchStartAllowed(this, event);
    if (!isAllowed) return;

    event.preventDefault();
    event.stopPropagation();

    handlePinchStart(this, event);
    handleCancelAnimation(this);
    handleCallback(getContext(this), onPinchingStart);
    handleCallback(getContext(this), onZoomStart);
  };

  onPinch = (event: TouchEvent): void => {
    const { disabled } = this.setup;
    const { onPinching, onZoom } = this.props;

    if (disabled) return;

    const isAllowed = isPinchAllowed(this);
    if (!isAllowed) return;

    event.preventDefault();
    event.stopPropagation();

    handlePinchZoom(this, event);
    handleCallback(getContext(this), onPinching);
    handleCallback(getContext(this), onZoom);
  };

  onPinchStop = (): void => {
    const { onPinchingStop, onZoomStop } = this.props;
    if (!this.pinchStartScale && !this.isPanning) return;

    handlePinchStop(this);
    handleCallback(getContext(this), onPinchingStop);
    handleCallback(getContext(this), onZoomStop);
  };

  //////////
  // Touch
  //////////

  onTouchPanningStart = (event: TouchEvent): void => {
    const { disabled } = this.setup;
    const { onPanningStart } = this.props;

    if (disabled) return;

    const isAllowed = isPanningStartAllowed(this, event);
    if (!isAllowed) return;

    handleCancelAnimation(this);

    const { touches } = event;

    const isPanningAction = touches.length === 1;
    const isPinchAction = touches.length === 2;

    if (isPanningAction) {
      event.preventDefault();
      event.stopPropagation();

      handleCancelAnimation(this);
      handlePanningStart(this, event);
      handleCallback(getContext(this), onPanningStart);
    }
    if (isPinchAction) {
      this.onPinchStart(event);
    }
  };

  onTouchPanning = (event: TouchEvent): void => {
    const { disabled } = this.setup;
    const { onPanning } = this.props;

    const isPanningAction = event.touches.length === 1;
    const isPinchAction = event.touches.length === 2;

    if (isPanningAction) {
      if (disabled) return;

      const isAllowed = isPanningAllowed(this);
      if (!isAllowed) return;

      const touch = event.touches[0];
      handlePanning(this, touch.clientX, touch.clientY);
      handleCallback(getContext(this), onPanning);
    }
    if (isPinchAction) {
      this.onPinch(event);
    }
  };

  onTouchPanningStop = (): void => {
    this.onPinchStop();
    this.onPanningStop();
  };

  //////////
  // Double Click
  //////////

  onDoubleClick = (event: MouseEvent): void => {
    const { disabled } = this.setup;
    if (disabled) return;

    const isAllowed = isDoubleClickAllowed(this);
    if (!isAllowed) return;

    handleDoubleClick(this, event);
  };

  //////////
  // Helpers
  //////////

  setKeyPressed = (e: KeyboardEvent): void => {
    this.pressedKeys[e.key] = true;
  };

  setKeyUnPressed = (e: KeyboardEvent): void => {
    this.pressedKeys[e.key] = false;
  };

  isPressingKeys = (keys: string[]): boolean => {
    if (!keys.length) {
      return true;
    }
    return Boolean(keys.find((key) => this.pressedKeys[key]));
  };

  setComponents = (
    wrapperComponent: HTMLDivElement,
    contentComponent: HTMLDivElement,
  ): void => {
    this.wrapperComponent = wrapperComponent;
    this.contentComponent = contentComponent;
    handleCalculateBounds(this, this.transformState.scale);
    this.handleInitializeWrapperEvents(wrapperComponent);
    this.handleInitializeContentEvents(contentComponent);
    this.isInitialized = true;
  };

  applyTransformation = (): void => {
    if (!this.mounted || !this.contentComponent) return;
    const { scale, positionX, positionY } = this.transformState;

    const newPositionX = positionX;
    const newPositionY = positionY;
    const newScale = scale;
    const transform = getTransformStyles(newPositionX, newPositionY, newScale);

    this.contentComponent.style.transform = transform;

    // force update to inject state to the context and avoid async set state which caused animations/updates problems
    this.forceUpdate();
    this.handleRef();
  };

  handleRef = (): void => {
    this.props.setRef(getContext(this));
  };

  render(): JSX.Element {
    const value = getContext(this);
    const { children } = this.props;
    const content = typeof children === "function" ? children(value) : children;

    return (
      <Context.Provider
        value={{
          ...this.transformState,
          setComponents: this.setComponents,
          contextInstance: this,
        }}
      >
        {content}
      </Context.Provider>
    );
  }
}

export { Context, TransformContext };