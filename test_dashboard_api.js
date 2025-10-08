// Test script for dashboard APIs
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function testDashboardAPIs() {
  console.log('🧪 Testing Dashboard APIs...\n');

  try {
    // Test coordinator dashboard API
    console.log('📊 Testing Coordinator Dashboard API...');
    const coordinatorResponse = await fetch(`${BASE_URL}/dashboard/api/coordinator/data`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'userId=1' // Assuming admin user has ID 1
      }
    });

    if (coordinatorResponse.ok) {
      const coordinatorData = await coordinatorResponse.json();
      console.log('✅ Coordinator API Response:');
      console.log('   KPI:', coordinatorData.kpi);
      console.log('   Recent Assignments:', coordinatorData.recentAssignments?.length || 0);
      console.log('   Outliers:', coordinatorData.outliers?.length || 0);
    } else {
      console.log('❌ Coordinator API failed:', coordinatorResponse.status, coordinatorResponse.statusText);
    }

    console.log('\n📝 Testing Marker Dashboard API...');
    const markerResponse = await fetch(`${BASE_URL}/dashboard/api/marker/data`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'userId=2' // Assuming marker user has ID 2
      }
    });

    if (markerResponse.ok) {
      const markerData = await markerResponse.json();
      console.log('✅ Marker API Response:');
      console.log('   KPI:', markerData.kpi);
      console.log('   Pending Assignments:', markerData.pendingAssignments?.length || 0);
      console.log('   Completed Assignments:', markerData.completedAssignments?.length || 0);
      console.log('   Recent Feedback:', markerData.recentFeedback?.length || 0);
    } else {
      console.log('❌ Marker API failed:', markerResponse.status, markerResponse.statusText);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testDashboardAPIs();
