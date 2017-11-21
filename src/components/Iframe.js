import Vue from 'vue';
import EventCard from 'src/components/EventCard';
import geoJsonHelpers from 'turf-helpers';
import mapboxgl from 'mapbox-gl';

mapboxgl.accessToken = 'pk.eyJ1Ijoia2VubmV0aHBlbm5pbmd0b24iLCJhIjoiY2l6bmJ3MmFiMDMzZTMzbDJtdGxkM3hveSJ9.w4iOGaL2vrIvETimSXUXsw';

var specialEventsIds = [1372, 1373, 1374, 1375, 1376, 1377, 1378, 1379, 1380, 1381, 1382];

export default function(store){
  return new Vue({
    el: '#event-map-iframe',
    name: 'event-map-iframe',
    template: require('src/templates/Iframe.html'),
    store,
    data: {
      mapRef: null,
      eventsLayer: null,
      initialCoordinates: [-96.9, 37.8],
      initialZoom: 0,
      boundsOfContinentalUS: [[-124.848974, 24.396308], [-66.885444, 49.384358]],
    },
    computed: {
      events() {
        return store.state.events;
      },
      zipcodes() {
        return store.state.zipcodes;
      },
      eventTypes() {
        return store.state.eventTypes;
      },
      filters() {
        return store.state.filters;
      },
      filteredEvents() {
        return store.getters.filteredEvents;
      },
      geojsonEvents() {
        return geoJsonHelpers.featureCollection(
          this.filteredEvents.map(event => {
            var isSpecial = specialEventsIds.indexOf(event.id) !== -1;

            return geoJsonHelpers.point(
              [event.lng, event.lat],
              {
                id: event.id,
                isOfficial: !!event.is_official,
                icon: isSpecial ? "special-star" : "special-circle"
              }
            )
          })
        );
      },
      view() {
        return store.state.view;
      }
    },
    watch: {
      events(newEvents, oldEvents) {
        this.plotEvents();

        // events data just showed up on app boot, if applicable
        // set the map position based on zip
        if (newEvents.length && !oldEvents.length) {
          this.setMapPositionBasedOnZip();
        }
      },

      // zipcodes should only change once, and when they do,
      // if applicable, set the map position based on zip
      zipcodes(newZipcodes, oldZipcodes) {
        this.plotEvents();
        this.setMapPositionBasedOnZip();
      },

      filters(newFilters, oldFilters) {
        this.plotEvents();

        // zoom to new location when zipcode changes
        if (newFilters.zipcode !== oldFilters.zipcode) {
          this.setMapPositionBasedOnZip();
        }
      },

      // when the map is toggled to, make sure to resize accordingly
      view(newView, oldView) {
        if (newView !== oldView && newView === 'map' && this.mapRef) {
          Vue.nextTick(() => this.mapRef.resize());
        }
      }
    },
    methods: {
      plotEvents() {
        if (!this.mapRef) return;

        const eventsSource = this.mapRef.getSource("events");

        // mapbox will throw an error if we add data before the source has been added,
        // which may happen if the zipcodes load faster than mapbox-gl mounts
        if (eventsSource) {
          eventsSource.setData(this.geojsonEvents);
        }
      },

      setMapPositionBasedOnZip() {
        if (!this.mapRef) return;

        const zipcodeCoordinates = this.zipcodes[this.filters.zipcode];

        if (zipcodeCoordinates) {
          this.mapRef.flyTo({
            center: zipcodeCoordinates,
            zoom: 8
          });
        } else {
          this.mapRef.fitBounds(this.boundsOfContinentalUS);
        }
      },

      createEventsDataSource() {
        this.mapRef.addSource("events", {
          "type": "geojson",
          // Depending on the order in which things load,
          // this may be intitialized empty and may be ready to roll
          "data": this.geojsonEvents,
        });
      },

      // For all layers, we want the cursor to be a pointer on hover.
      setCursorStyleOnHover() {
        this.mapRef.on('mouseenter', 'points', (e) => {
          this.mapRef.getCanvas().style.cursor = 'pointer';
        });

        this.mapRef.on('mouseleave', 'points', (e) => {
          this.mapRef.getCanvas().style.cursor = '';
        });
      },

      getPopupContent(eventIds) {
        // Create a Vue instance _inside_ a mapbox Map instance
        // _inside_ another Vue instance WHOAH. The point is
        // to reuse the existing event card component.

        const filteredEvents = this.filteredEvents;
        const eventTypes = this.eventTypes;

        let eventCard = document.createElement("div");
        eventCard.className = "event-card-wrapper";

        eventIds.forEach(function(eventId, i) {
          const vm = new Vue({
            template: '<event-card :event="event" :event-types="eventTypes"></event-card>',
            data: {
              event: filteredEvents.find(ev => ev.id === eventId),
              eventTypes: eventTypes
            },
            components: {
              'event-card': EventCard
            }
          }).$mount();

          eventCard.appendChild(vm.$el);
          if (i !== eventIds.length - 1) {
            eventCard.appendChild(document.createElement("hr"));
          }
        });

        return eventCard;

      },

      openPopupsOnClick() {

        this.mapRef.on('click', 'points', (e) => {

          const eventIds = e.features.map(feature =>
                                          feature.properties.id);
          const eventCoordinates = e.features[0].geometry.coordinates;

          store.commit('eventSelected', eventIds);

          let popupOptions = {};

          // If the viewport width is on the small side, let’s put
          // the popup on top of the marker and pan to it, so that
          // it will usually look ok. For larger screens the
          // popup is smart enough to usually Just Work.
          if (document.documentElement.clientWidth < 600) {
            popupOptions.anchor = 'bottom';

            const bounds = this.mapRef.getBounds();

            // The map’s height expressed in degrees of latitude
            const mapHeight = bounds.getNorth() - bounds.getSouth();

            // So pan to where that marker lives but centered a bit above it,
            // to account for the tooltip. .5 of the map height would put
            // the marker at the exact bottom edge of the screen; this is
            // adjusted to look a little better.
            this.mapRef.panTo([
              eventCoordinates[0],
              eventCoordinates[1] + (mapHeight * .4)
            ]);
          }

          new mapboxgl.Popup(popupOptions)
            .setLngLat(eventCoordinates)
            .setDOMContent(this.getPopupContent(eventIds))
            .addTo(this.mapRef);
        });
      },

      mapMounted() {
        this.$refs.map.className = this.$refs.map.className.replace('-loading', '');

        this.createEventsDataSource();

        var self = this;

        self.mapRef.loadImage('https://s3.us-east-2.amazonaws.com/teaminternet-map-prod/images/star-icon.png', function(error, image) {
          if (error) throw error;
          self.mapRef.addImage('special-star', image);

          self.mapRef.loadImage('https://s3.us-east-2.amazonaws.com/teaminternet-map-prod/images/circle-icon.png', function(error, image) {
            if (error) throw error;
            self.mapRef.addImage('special-circle', image);

            self.mapRef.addLayer({
              id: 'points',
              type: 'symbol',
              source: 'events',
              paint: {
                // 'circle-color': '#ff4b4d',
                // 'circle-radius': 6,
                // 'circle-stroke-width': 2,
                // 'circle-stroke-color': 'white'
              },
              layout: {
                "icon-image": "{icon}",
                "icon-allow-overlap": true
              }
            });

            self.setCursorStyleOnHover();
            self.openPopupsOnClick();

            self.plotEvents();
          });
        });
      }
    },

    mounted() {
      this.mapRef = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/bright-v9',
        center: this.initialCoordinates,
        zoom: this.initialZoom
      });

      this.mapRef.addControl(new mapboxgl.NavigationControl());
      this.mapRef.on("load", this.mapMounted);
    }
  })
}
