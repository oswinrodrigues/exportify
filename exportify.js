window.Helpers = {
  apiCall: function(url, access_token) {
    return $.ajax({
      url: url,
      headers: {
        'Authorization': 'Bearer ' + access_token
      }
    }).fail(function (jqXHR, textStatus) {
      if (jqXHR.status == 401) {
        // Return to home page after auth token expiry
        window.location = window.location.href.split('#')[0]
      } else {
        // Otherwise report the error so user can raise an issue
        alert(jqXHR.responseText);
      }
    })
  }
}

var PlaylistTable = React.createClass({
  getInitialState: function() {
    return {
      playlists: [],
      nextURL: null,
      prevURL: null
    };
  },

  loadPlaylists: function(url) {
    var userId = '';

    window.Helpers.apiCall("https://api.spotify.com/v1/me", this.props.access_token).then(function(response) {
      userId = response.id;

      return window.Helpers.apiCall(
        typeof url !== 'undefined' ? url : "https://api.spotify.com/v1/users/" + userId + "/playlists",
        this.props.access_token
      )
    }.bind(this)).done(function(response) {
      if (this.isMounted()) {
        this.setState({
          playlists: response.items,
          nextURL: response.next,
          prevURL: response.previous
        });

        $('#playlists').fadeIn();
        $('#subtitle').text((response.offset + 1) + '-' + (response.offset + response.items.length) + ' of ' + response.total + ' playlists for ' + userId)
      }
    }.bind(this))
  },

  componentDidMount: function() {
    this.loadPlaylists(this.props.url);
  },

  render: function() {
    if (this.state.playlists.length > 0) {
      return (
        <div id="playlists">
          <Paginator nextURL={this.state.nextURL} prevURL={this.state.prevURL} loadPlaylists={this.loadPlaylists}/>
          <table className="table table-hover">
            <thead>
              <tr>
                <th style={{width: "30px"}}></th>
                <th>Name</th>
                <th>Owner</th>
                <th>Tracks</th>
                <th>Public?</th>
                <th>Collaborative?</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {this.state.playlists.map(function(playlist, i) {
                return <PlaylistRow playlist={playlist} key={playlist.id} access_token={this.props.access_token}/>;
              }.bind(this))}
            </tbody>
          </table>
          <Paginator nextURL={this.state.nextURL} prevURL={this.state.prevURL} loadPlaylists={this.loadPlaylists}/>
        </div>
      );
    } else {
      return <div className="spinner"></div>
    }
  }
});

var PlaylistRow = React.createClass({
  exportPlaylist: function() {
    PlaylistExporter.export(this.props.access_token, this.props.playlist);
  },

  renderTickCross: function(condition) {
    if (condition) {
      return <i className="fa fa-lg fa-check-circle-o"></i>
    } else {
      return <i className="fa fa-lg fa-times-circle-o" style={{ color: '#ECEBE8' }}></i>
    }
  },

  render: function() {
    playlist = this.props.playlist

    return (
      <tr key={this.props.key}>
        <td><i className="fa fa-music"></i></td>
        <td><a href={playlist.uri}>{playlist.name}</a></td>
        <td><a href={playlist.owner.uri}>{playlist.owner.id}</a></td>
        <td>{playlist.tracks.total}</td>
        <td>{this.renderTickCross(playlist.public)}</td>
        <td>{this.renderTickCross(playlist.collaborative)}</td>
        <td className="text-right"><button className="btn btn-default btn-xs btn-success" type="submit" onClick={this.exportPlaylist}><span className="glyphicon glyphicon-save"></span> Export</button></td>
      </tr>
    );
  }
});

var Paginator = React.createClass({
  nextClick: function(e) {
    e.preventDefault()

    if (this.props.nextURL != null) {
      this.props.loadPlaylists(this.props.nextURL)
    }
  },

  prevClick: function(e) {
    e.preventDefault()

    if (this.props.prevURL != null) {
      this.props.loadPlaylists(this.props.prevURL)
    }
  },

  render: function() {
    if (this.props.nextURL != null || this.props.prevURL != null) {
      return (
        <nav className="paginator text-right">
          <ul className="pagination pagination-sm">
            <li className={this.props.prevURL == null ? 'disabled' : ''}>
              <a href="#" aria-label="Previous" onClick={this.prevClick}>
                <span aria-hidden="true">&laquo;</span>
              </a>
            </li>
            <li className={this.props.nextURL == null ? 'disabled' : ''}>
              <a href="#" aria-label="Next" onClick={this.nextClick}>
                <span aria-hidden="true">&raquo;</span>
              </a>
            </li>
          </ul>
        </nav>
      )
    } else {
      return <div>&nbsp;</div>
    }
  }
});

var PlaylistExporter = {
  export: function(access_token, playlist) {
    this.csvData(access_token, playlist).then(function(data) {
      var encodedUri = encodeURI("data:text/csv;charset=utf-8," + data);
      var link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", this.fileName(playlist));

      link.click();
    }.bind(this))
  },

  csvData: function(access_token, playlist) {
    var requests = [];
    var limit = 100;

    for (var offset = 0; offset < playlist.tracks.total; offset = offset + limit) {
      requests.push(
        window.Helpers.apiCall(playlist.tracks.href + '?offset=' + offset + '&limit=' + limit, access_token)
      )
    }

    return $.when.apply($, requests).then(function() {
      var responses = [];

      // Handle either single or multiple responses
      if (typeof arguments[0].href == 'undefined') {
        responses = Array.prototype.slice.call(arguments).map(function(a) { return a[0] });
      } else {
        responses = [arguments[0]];
      }

      var tracks = responses.map(function(response) {
        return response.items.map(function(item) {
          return [
            item.track.uri,
            item.track.name,
            item.track.artists.map(function(artist) { return artist.name }).join(', '),
            item.track.album.name,
            item.track.disc_number,
            item.track.track_number,
            item.track.duration_ms,
            item.added_by == null ? '' : item.added_by.uri,
            item.added_at
          ].map(function(track) { return '"' + track + '"'; })
        });
      });

      // Flatten the array of pages
      tracks = $.map(tracks, function(n) { return n })

      tracks.unshift([
        "Spotify URI",
        "Track Name",
        "Artist Name",
        "Album Name",
        "Disc Number",
        "Track Number",
        "Track Duration (ms)",
        "Added By",
        "Added At"
      ]);

      csvContent = '';
      tracks.forEach(function(infoArray, index){
        dataString = infoArray.join(",");
        csvContent += index < tracks.length ? dataString+ "\n" : dataString;
      });

      return csvContent;
    });
  },

  fileName: function(playlist) {
    return playlist.name.replace(/[^a-z0-9\- ]/gi, '').replace(/[ ]/gi, '_').toLowerCase() + ".csv";
  }
}

$(function() {
  var vars = window.location.hash.substring(1).split('&');
  var key = {};
  for (i=0; i<vars.length; i++) {
    var tmp = vars[i].split('=');
    key[tmp[0]] = tmp[1];
  }

  if (typeof key['access_token'] === 'undefined') {
    $('#loginButton').css('display', 'inline-block')
  } else {
    React.render(<PlaylistTable access_token={key['access_token']} />, playlistsContainer);
  }
});
