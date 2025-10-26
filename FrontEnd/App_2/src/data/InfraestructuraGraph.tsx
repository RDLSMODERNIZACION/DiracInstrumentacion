import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { computeAutoLayout } from '@/layout/auto'; // Importamos la función de layout

const InfraestructuraGraph = () => {
  // Inicializa los estados para los nodos y las aristas
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

  useEffect(() => {
    // Obtener los tanques y bombas desde el backend
    const fetchNodes = async () => {
      try {
        // Llamada a la API de tanques
        const tanksResponse = await axios.get('https://backend-v85n.onrender.com/infraestructura/get_tanks_with_config');
        // Llamada a la API de bombas
        const pumpsResponse = await axios.get('https://backend-v85n.onrender.com/infraestructura/get_pumps_with_status');

        // Mapear los tanques al formato que espera el front-end
        const tankNodes = tanksResponse.data.map((tank) => ({
          id: tank.tank_id, // Usamos el tank_id como node_id
          type: 'tank', // Indicamos que es un nodo de tipo 'tank'
          name: tank.name, // El nombre del tanque
          x: tank.x || 0, // Usamos la ubicación si está disponible, o un valor por defecto
          y: tank.y || 0, // Usamos la ubicación si está disponible, o un valor por defecto
        }));

        // Mapear las bombas al formato que espera el front-end
        const pumpNodes = pumpsResponse.data.map((pump) => ({
          id: pump.pump_id, // Usamos el pump_id como node_id
          type: 'pump', // Indicamos que es un nodo de tipo 'pump'
          name: pump.name, // El nombre de la bomba
          x: 0, // Inicializamos x como 0
          y: 0, // Inicializamos y como 0
        }));

        // Combinar los nodos de tanques y bombas en un solo arreglo
        const allNodes = [...tankNodes, ...pumpNodes];
        
        // Calcular la disposición automática de los nodos (bombas y tanques) si no tienen coordenadas
        const layoutNodes = computeAutoLayout(allNodes);

        // Actualizar el estado con los nodos y las coordenadas calculadas
        setNodes(layoutNodes);
      } catch (error) {
        console.error('Error fetching nodes:', error);
      }
    };

    // Obtener las conexiones (aristas) desde el backend
    const fetchEdges = async () => {
      try {
        // Llamada a la API de conexiones
        const edgesResponse = await axios.get('https://backend-v85n.onrender.com/infraestructura/get_layout_edges');
        // Mapear las conexiones al formato que espera el front-end
        const edgesData = edgesResponse.data.map((edge) => ({
          from: edge.src_node_id, // El id del nodo origen
          to: edge.dst_node_id,   // El id del nodo destino
        }));
        setEdges(edgesData);
      } catch (error) {
        console.error('Error fetching edges:', error);
      }
    };

    // Llamar a las funciones para obtener los datos
    fetchNodes();
    fetchEdges();
  }, []); // El array vacío asegura que esto se ejecute una sola vez al montar el componente

  // Renderizar el gráfico pasándole los nodos y las aristas como props
  return (
    <div>
      <h2>Infraestructura - Mapa de Red</h2>
      <GraphVisualization nodes={nodes} edges={edges} />
    </div>
  );
};

export default InfraestructuraGraph;
