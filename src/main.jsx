import React from 'react'
import ReactDOM from 'react-dom/client'
import MWPlay from './MWPlay.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('MW Play error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight:'100vh', background:'#070A10', display:'flex',
          flexDirection:'column', alignItems:'center', justifyContent:'center',
          padding:24, fontFamily:'sans-serif', textAlign:'center'
        }}>
          <div style={{fontSize:48, marginBottom:16}}>🎵</div>
          <h2 style={{color:'#fff', fontSize:20, marginBottom:8, fontWeight:700}}>
            Something went wrong
          </h2>
          <p style={{color:'#6B7A99', fontSize:13, marginBottom:28, lineHeight:1.6}}>
            MW Play hit an unexpected error. Tap the button below to reload.
          </p>
          <button
            onClick={() => { this.setState({hasError:false,error:null}); window.location.reload(); }}
            style={{
              background:'#1A8FE3', color:'#fff', border:'none', borderRadius:10,
              padding:'12px 28px', fontSize:14, fontWeight:700, cursor:'pointer'
            }}>
            Reload MW Play
          </button>
          <p style={{color:'#2A3550', fontSize:11, marginTop:20}}>
            If this keeps happening, contact us on WhatsApp: 0884907615
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <MWPlay />
    </ErrorBoundary>
  </React.StrictMode>
)
