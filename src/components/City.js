import {
  CanvasTexture,
  Geometry,
  LineBasicMaterial,
  Line,
  Color,
  Mesh,
  BoxBufferGeometry,
  MeshBasicMaterial,
  Scene,
  Vector3
} from 'three';

import House from './House';
import Car from './Car';
import CarModel from './Car/CarModel';
import Road, {RoadNode} from './Road';
import WorldMatrix from '../services/WorldMatrix';
import Navigation from '../services/Navigation';
import TrafficLightController from '../services/TrafficLightController';
import constants from '../helpers/constants';
import utils from '../helpers/utils';

class DarwinCity {
  constructor(props) {
    this.scene = new Scene();
    this.scene.background = new Color(0xfae0cb);

    this.carsTotal = props.carsTotal;
    this.roadsTotal = props.roadsTotal;
    this.roadLanes = props.roadLanes;
    this.tileSize = constants.tileSize;
    this.width = constants.worldWidth;
    this.height = constants.worldHeight;
    this.matrix = WorldMatrix;
    this.groundCanvas = document.createElement('canvas');
    this.groundCanvas.width = this.width * 2;
    this.groundCanvas.height = this.height * 2;

    this.roads = [];
    this.junctions = [];
    this.trafficLightController = null;
    this.houses = [
      new House({
        width: 30,
        height: 101,
        depth: 20,
        x: 150,
        y: -200
      })
    ];
    this.cars = [];
    this.trafficLights = [];
    this.callbacks = {};

    this.initilize();
    this.toggleTrafficSignals = this.toggleTrafficSignals.bind(this);
  }

  drawTilesGrid() {
    const ctx = this.groundCanvas.getContext('2d');
    ctx.fillStyle = '#cac4ae';
    ctx.fillRect(0, 0, this.width * 2, this.height * 2);

    this.matrix.getTiles().forEach((tile) => {
      ctx.strokeStyle = '#aea998';
      ctx.strokeRect(this.tileSize * tile.x * 2, this.tileSize * tile.y * 2, this.tileSize * 2, this.tileSize * 2);
    });
  }

  populateRoads() {
    const ctx = this.groundCanvas.getContext('2d');
    const axes = ['Row', 'Col'];

    // Create Roads
    for(let i = 0; i < this.roadsTotal; i++) {
      const axis = axes[i % 2];
      const counter = Math.floor(i / 2);
      const tileMod = i % 2 === 0 ? 0 : this.roadsTotal % 2;
      const tilePart = Math.floor(this.matrix.size / (Math.ceil(this.roadsTotal / 2) + 1 - tileMod));
      const tileIndex = tilePart + (tilePart * counter);
      const firstTile = axis === 'Col' ? this.matrix.getTile(tileIndex, 0) : this.matrix.getTile(0, tileIndex);
      const lastTile = axis === 'Col' ? this.matrix.getTile(tileIndex, this.matrix.size - 1) : this.matrix.getTile(this.matrix.size - 1, tileIndex);

      const road = new Road({
        name: `${axis}-${counter}`,
        nodes: [
          new RoadNode({x: firstTile.sceneX, y: firstTile.sceneY}),
          new RoadNode({x: lastTile.sceneX, y: lastTile.sceneY})
        ],
        roadLanes: this.roadLanes
      });

      this.roads.push(road);
    }

    // Create Junctions
    for(let i = 0; i < this.roads.length; i++) {
      const road1 = this.roads[i];
      for(let j = i + 1; j < this.roads.length; j++) {
        const road2 = this.roads[j];

        const junction = Road.createRoadsJunctions(road1, road2);
        if(junction) {
          this.junctions.push(junction);
        }
      }
    }

    this.junctions.forEach((junction) => junction.connectWayTransfers());

    this.roads.forEach((road) => {
      road.ways.forEach((way) => {
        way.updateNextNodes();
      });
    });

    // Draw Roads on canvas
    this.roads.forEach((road) => road.drawOnCanvas(ctx));
    this.junctions.forEach((junction) => junction.drawOnCanvas(ctx));
    // this.roads.forEach((road) => road.getRoadPaths().forEach((roadPath) => {
    //   roadPath.drawDetailsOnCanvas(ctx);
    // }));
    // this.roads.forEach((road) => {
    //   road.ways.forEach((way) => way.drawOnCanvas(ctx));
    // });
  }

  createCarRouteTrace(car) {
    const geometry = new Geometry();
    const material = new LineBasicMaterial({
      color: car.color
    });

    car.route.forEach((point) => {
      geometry.vertices.push(new Vector3(point.x, point.y, -5));
    });

    car.routeTrace = new Line(geometry, material);
    car.routeTrace.rotation.x = 90 * Math.PI / 180;
    this.scene.add(car.routeTrace);
  }

  onCarBrake(car) {
    // const index = this.cars.findIndex((tmpCar) => tmpCar === car);
    // this.cars.splice(index, 1);
    // this.scene.remove(car.mesh);
    // this.scene.remove(car.routeTrace);
    if(this.callbacks.carAccident) {
      this.callbacks.carAccident();
    }
  }

  onCarArrival(car) {
    const index = this.cars.findIndex((tmpCar) => tmpCar === car);
    this.cars.splice(index, 1);
    this.scene.remove(car.mesh);
    this.scene.remove(car.routeTrace);
    if(this.callbacks.carArrival) {
      this.callbacks.carArrival();
    }
  }

  createRandomCar(startPoint, endPoint, index) {
    const routePath = Navigation.findBestRoute(startPoint, endPoint);

    const car = new Car({
      position: {
        x: routePath[0].x,
        y: routePath[0].y
      },
      angle: routePath[0].roadPath.getAngle()
    });
    car.setRoute(routePath, {onArrival: this.onCarArrival.bind(this), onBrake: this.onCarBrake.bind(this)});
    // this.createCarRouteTrace(car);

    this.scene.add(car.mesh);
    this.cars.push(car);
    car.index = index;
  }

  getFreePointsToEnterCar() {
    const freePoints = [];
    let minDist;
    let initPointVec;

    this.roads.forEach((road) => {
      const initPoints = road.getInitPoints();

      for(let i = 0; i < initPoints.length; i++) {
        minDist = null;
        initPointVec = new Vector3(initPoints[i].x, -5, initPoints[i].y);

        for(let j = 0; j < this.cars.length; j++) {
          const car = this.cars[j];

          if(car.currentRoadPath !== initPoints[i].roadPath) {
            continue;
          }

          const dist = car.mesh.position.distanceTo(initPointVec);

          if(!minDist) {
            minDist = dist;
            continue;
          }

          if(dist < minDist) {
            minDist = dist;
          }
        }

        if(minDist === null || minDist > (CarModel.carSize * 2)) {
          freePoints.push(initPoints[i]);
        }
      }
    });

    return freePoints;
  }

  populateCars() {
    const onQueueCars = this.carsTotal - this.cars.length;

    if(onQueueCars === 0) {
      return;
    }

    const freePoints = this.getFreePointsToEnterCar();
    const len = Math.min(freePoints.length, onQueueCars);
    let randomFreePointIdx;
    let startPoint;
    let endRoad;
    let endWay;
    let endPoint;

    for(let i = 0; i < len; i++) {
      randomFreePointIdx = utils.getRandomInt(0, freePoints.length);
      [startPoint] = freePoints.splice(randomFreePointIdx, 1);
      // endRoad = this.getDifferentRoad(startPoint.roadPath.way.road);
      endRoad = this.roads[utils.getRandomInt(0, this.roads.length)];
      endWay = endRoad.ways[utils.getRandomInt(0, endRoad.ways.length)];
      if(endRoad === startPoint.roadPath.way.road) {
        endWay = startPoint.roadPath.way;
      }
      endPoint = endWay.lanes[utils.getRandomInt(0, endWay.lanes.length)].getDeepestPoint();
      this.createRandomCar(startPoint, endPoint, this.cars.length);
    }
  }

  getDifferentRoad(road) {
    const differentRoads = this.roads.filter((tmpRoad) => tmpRoad !== road);
    return differentRoads[utils.getRandomInt(0, differentRoads.length)];
  }

  populateBuildings() {
    this.houses.forEach((house) => {
      this.scene.add(house.mesh);
    });
  }

  createGround() {
    const ground = new Mesh(
      new BoxBufferGeometry(this.width, 20, this.height),
      [
        new MeshBasicMaterial({color: 0xcac4ae}),
        new MeshBasicMaterial({color: 0xcac4ae}),
        new MeshBasicMaterial({map: new CanvasTexture(this.groundCanvas)}),
        // new MeshBasicMaterial({color: 0xcac4ae}),
        new MeshBasicMaterial({color: 0xcac4ae}),
        new MeshBasicMaterial({color: 0xcac4ae}),
        new MeshBasicMaterial({color: 0xcac4ae})
      ]
    );
    ground.position.set(0, -10, 0);
    this.scene.add(ground);

    // const ctx = this.groundCanvas.getContext('2d');
    // utils.loadImage('/bg.png', (imageEl) => {
    //   ctx.drawImage(imageEl, 0, 0);
    //   ground.needUpdate = true;
    //   ground.material[2] = new MeshBasicMaterial({map: new CanvasTexture(this.groundCanvas)});
    //   this.roads.forEach((road) => road.drawOnCanvas(ctx));
    // });
  }

  installTrafficController() {
    this.junctions.forEach((junction) => {
      junction.trafficLights.forEach((trafficLight) => {
        this.trafficLights.push(trafficLight);
        this.scene.add(trafficLight.mesh);
      });
    });

    this.trafficLightController = new TrafficLightController(this.trafficLights);
  }

  createCenterReference() {
    const referenceY = new Mesh(
      new BoxBufferGeometry(5, 125, 5),
      new MeshBasicMaterial({color: 0xff0000}),
    );
    referenceY.rotation.x = -Math.PI / 2;
    this.scene.add(referenceY);

    const referenceX = new Mesh(
      new BoxBufferGeometry(125, 5, 5),
      new MeshBasicMaterial({color: 0xff0000}),
    );
    referenceX.rotation.x = -Math.PI / 2;
    this.scene.add(referenceX);
  }

  initilize() {
    this.drawTilesGrid();
    this.populateRoads();
    this.installTrafficController();
    // this.populateBuildings();
    this.populateCars();
    this.createGround();
    // this.createCenterReference();
  }

  getCarCollidableList(car) {
    const dangerZoneRadius = 90;
    let dist;

    const cars = this.cars.filter((car2) => {
      if(car2.broken || car === car2) {
        return false;
      }

      dist = car.mesh.position.distanceTo(car2.mesh.position);

      return dist < dangerZoneRadius;
    });

    const carRoadPath = car.currentRoadPath;
    const trafficLights = this.trafficLights.filter((trafficLight) => {
      if(
        !trafficLight.active ||
        (trafficLight.roadPath !== carRoadPath && trafficLight.state === 'green') ||
        (car.transferingToPath && trafficLight.availableRoadPaths.indexOf(car.transferingToPath) !== -1)
      ) {
        return false;
      }

      dist = car.mesh.position.distanceTo(trafficLight.mesh.position);

      return dist < dangerZoneRadius;
    });

    return [...cars, ...trafficLights];
  }

  toggleTrafficSignals() {
    if(!this.trafficLightController) {
      this.trafficLightController = new TrafficLightController(this.trafficLights);
      return;
    }

    this.trafficLightController.destroy();
    this.trafficLightController = null;
  }

  on(eventName, callback) {
    this.callbacks[eventName] = callback;
    return this;
  }

  updateCars() {
    const len = this.cars.length;
    let i;
    let car;

    for(i = 0; i < len; i++) {
      car = this.cars[i];
      car.checkCollision(this.getCarCollidableList(car));
      car.update(i);
    }

    this.populateCars();
  }

  update() {
    this.updateCars();
  }
}

export default DarwinCity;
