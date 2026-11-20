@extends('errors.layout', ['tone' => 'info'])

@section('code', '429')
@section('title', 'Trop de demandes')
@section('message', 'Vous avez fait trop de demandes en peu de temps.')
@section('hint', 'Patientez une minute avant de réessayer.')
@section('actions')
    <a class="primary" href="{{ url()->current() }}">Réessayer</a>
@endsection
