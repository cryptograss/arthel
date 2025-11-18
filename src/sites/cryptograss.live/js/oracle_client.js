/**
 * Client-side Oracle of Bluegrass Bacon pathfinding
 */

class OracleClient {
    constructor() {
        this.musicians = [];
        this.graph = null;
        this.connections = [];
        this.adjacencyList = {};
        this.loaded = false;
    }
    
    async loadData() {
        if (this.loaded) return;
        
        try {
            console.log('Loading Oracle data...');
            
            // Load musicians list
            const musiciansResponse = await fetch('/api/oracle/musicians.json');
            if (!musiciansResponse.ok) {
                throw new Error('Failed to load musicians data');
            }
            this.musicians = await musiciansResponse.json();
            
            // Load full graph data
            const graphResponse = await fetch('/api/oracle/graph.json');
            if (!graphResponse.ok) {
                throw new Error('Failed to load graph data');
            }
            
            const graphData = await graphResponse.json();
            this.graph = graphData.musicians;
            this.connections = graphData.connections;
            this.adjacencyList = graphData.adjacencyList;
            
            this.loaded = true;
            console.log('Oracle data loaded:', graphData.stats);
        } catch (error) {
            console.error('Error loading Oracle data:', error);
            throw error;
        }
    }
    
    getMusicians() {
        return this.musicians;
    }
    
    /**
     * Find shortest path between two musicians using BFS
     */
    findPath(startMusician, endMusician) {
        if (!this.loaded) {
            throw new Error('Oracle data not loaded');
        }
        
        if (!this.adjacencyList[startMusician]) {
            throw new Error(`Musician "${startMusician}" not found in database`);
        }
        if (!this.adjacencyList[endMusician]) {
            throw new Error(`Musician "${endMusician}" not found in database`);
        }
        
        if (startMusician === endMusician) {
            return { path: [startMusician], connections: [], degrees: 0 };
        }
        
        const queue = [[startMusician]];
        const visited = new Set([startMusician]);
        
        while (queue.length > 0) {
            const currentPath = queue.shift();
            const currentMusician = currentPath[currentPath.length - 1];
            
            const neighbors = this.adjacencyList[currentMusician] || [];
            for (const neighbor of neighbors) {
                if (neighbor === endMusician) {
                    const finalPath = [...currentPath, neighbor];
                    const pathConnections = this.getConnectionsForPath(finalPath);
                    return {
                        path: finalPath,
                        connections: pathConnections,
                        degrees: finalPath.length - 1
                    };
                }
                
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push([...currentPath, neighbor]);
                }
            }
        }
        
        return null; // No path found
    }
    
    /**
     * Get the connections that link musicians in a path
     */
    getConnectionsForPath(pathArray) {
        const pathConnections = [];
        
        for (let i = 0; i < pathArray.length - 1; i++) {
            const musician1 = pathArray[i];
            const musician2 = pathArray[i + 1];
            
            // Find connection between these two musicians
            const connection = this.connections.find(conn => 
                (conn.musicians[0] === musician1 && conn.musicians[1] === musician2) ||
                (conn.musicians[0] === musician2 && conn.musicians[1] === musician1)
            );
            
            if (connection) {
                pathConnections.push(connection);
            }
        }
        
        return pathConnections;
    }
    
    /**
     * Search musicians by partial name match
     */
    searchMusicians(query) {
        if (!query || query.length < 2) return [];
        
        const lowerQuery = query.toLowerCase();
        return this.musicians
            .filter(musician => musician.toLowerCase().includes(lowerQuery))
            .slice(0, 10);
    }
}

// Export for use in the page
window.OracleClient = OracleClient;